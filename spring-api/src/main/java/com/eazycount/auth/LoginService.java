package com.eazycount.auth;

import com.eazycount.auth.SessionBootstrapStore.Payload;
import java.security.SecureRandom;
import java.sql.Date;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class LoginService {

  private static final Logger log = LoggerFactory.getLogger(LoginService.class);
  private static final SecureRandom RANDOM = new SecureRandom();

  private final JdbcTemplate jdbc;
  private final PasswordEncoder passwordEncoder;
  private final SessionBootstrapStore bootstrapStore;

  public LoginService(JdbcTemplate jdbc, PasswordEncoder passwordEncoder, SessionBootstrapStore bootstrapStore) {
    this.jdbc = jdbc;
    this.passwordEncoder = passwordEncoder;
    this.bootstrapStore = bootstrapStore;
  }

  public record LoginResult(boolean success, String message, String bootstrapToken) {}

  private static boolean isCompanyExpiredOrUnset(LocalDate expirationDate, String companyCode) {
    if (companyCode != null && "C168".equalsIgnoreCase(companyCode.trim())) {
      return false;
    }
    if (expirationDate == null) {
      return true;
    }
    return expirationDate.isBefore(LocalDate.now());
  }

  private static LocalDate toLocalDate(Date sqlDate) {
    if (sqlDate == null) {
      return null;
    }
    return sqlDate.toLocalDate();
  }

  private static String randomRememberToken() {
    byte[] buf = new byte[32];
    RANDOM.nextBytes(buf);
    return HexFormat.of().formatHex(buf);
  }

  @Transactional
  public LoginResult login(
      String passwordRaw,
      String companyIdRaw,
      String loginRoleRaw,
      String accountIdRaw,
      String loginIdRaw,
      String rememberMeRaw) {
    String password = passwordRaw == null ? "" : passwordRaw.trim();
    String companyId = companyIdRaw == null ? "" : companyIdRaw.trim().toUpperCase(Locale.ROOT);
    String loginRole = loginRoleRaw == null ? "" : loginRoleRaw.trim().toLowerCase(Locale.ROOT);
    if (loginRole.isEmpty()) {
      loginRole = "admin";
    }
    boolean rememberMe = "1".equals(rememberMeRaw) || "true".equalsIgnoreCase(rememberMeRaw);

    if (companyId.isEmpty()) {
      return new LoginResult(false, "Invalid request", null);
    }
    if (password.isEmpty()) {
      return new LoginResult(false, "Please enter password", null);
    }

    try {
      if ("member".equals(loginRole)) {
        return loginMember(password, companyId, accountIdRaw);
      }
      return loginAdminOrOwner(password, companyId, loginIdRaw, rememberMe);
    } catch (Exception e) {
      log.error("Login error for companyId={}", companyId, e);
      return new LoginResult(false, "Database error, please try again later", null);
    }
  }

  private LoginResult loginMember(String password, String companyId, String accountIdRaw) {
    String accountId = accountIdRaw == null ? "" : accountIdRaw.trim();
    if (accountId.isEmpty()) {
      return new LoginResult(false, "Please enter account ID", null);
    }

    String sql =
        """
        SELECT a.*, c.id AS company_numeric_id, c.company_id AS company_code, c.expiration_date
        FROM account a
        INNER JOIN account_company ac ON a.id = ac.account_id
        INNER JOIN company c ON ac.company_id = c.id
        WHERE UPPER(a.account_id) = UPPER(?)
        AND (UPPER(c.company_id) = ? OR UPPER(c.group_id) = ?)
        AND a.status = 'active'
        """;
    List<Map<String, Object>> rows = jdbc.queryForList(sql, accountId, companyId, companyId);

    Map<String, Object> account = null;
    boolean passwordMatch = false;
    boolean hasExpired = false;

    for (Map<String, Object> row : rows) {
      String rowPwd = row.get("password") != null ? String.valueOf(row.get("password")) : "";
      if (!rowPwd.isEmpty() && password.equals(rowPwd)) {
        passwordMatch = true;
        String code = row.get("company_code") != null ? String.valueOf(row.get("company_code")) : null;
        LocalDate exp = toLocalDate((Date) row.get("expiration_date"));
        if (isCompanyExpiredOrUnset(exp, code)) {
          hasExpired = true;
        } else {
          account = row;
          break;
        }
      }
    }

    if (account != null) {
      int aid = ((Number) account.get("id")).intValue();
      jdbc.update("UPDATE account SET last_login = NOW() WHERE id = ?", aid);

      Map<String, Object> session = new HashMap<>();
      session.put("member_login_account_id", aid);
      session.put("user_id", aid);
      session.put("login_id", String.valueOf(account.get("account_id")));
      session.put("name", account.get("name") != null ? String.valueOf(account.get("name")) : "");
      session.put("role", account.get("role") != null ? String.valueOf(account.get("role")) : "");
      session.put("user_type", "member");
      session.put("account_id", String.valueOf(account.get("account_id")));
      session.put("company_id", ((Number) account.get("company_numeric_id")).intValue());
      session.put("last_activity", (int) (System.currentTimeMillis() / 1000));

      String token = bootstrapStore.put(new Payload("index.php?r=/member", session));
      return new LoginResult(true, null, token);
    }

    if (passwordMatch && hasExpired) {
      return new LoginResult(false, "Company or Group has expired.", null);
    }
    return new LoginResult(false, "Account ID, Company ID or password is incorrect", null);
  }

  private LoginResult loginAdminOrOwner(String password, String companyId, String loginIdRaw, boolean rememberMe) {
    String loginId = loginIdRaw == null ? "" : loginIdRaw.trim();
    if (loginId.isEmpty()) {
      return new LoginResult(false, "Please enter username", null);
    }

    String userSql =
        """
        SELECT u.*, c.id AS company_numeric_id, c.company_id AS company_code, c.expiration_date
        FROM user u
        INNER JOIN user_company_map ucm ON u.id = ucm.user_id
        INNER JOIN company c ON ucm.company_id = c.id
        WHERE u.login_id = ? AND (UPPER(c.company_id) = ? OR UPPER(c.group_id) = ?) AND u.status = 'active'
        """;
    List<Map<String, Object>> users = jdbc.queryForList(userSql, loginId, companyId, companyId);

    Map<String, Object> user = null;
    boolean userPasswordMatch = false;
    boolean userHasExpired = false;

    for (Map<String, Object> row : users) {
      String hashed = row.get("password") != null ? String.valueOf(row.get("password")) : "";
      if (!hashed.isEmpty() && passwordEncoder.matches(password, hashed)) {
        userPasswordMatch = true;
        String code = row.get("company_code") != null ? String.valueOf(row.get("company_code")) : null;
        LocalDate exp = toLocalDate((Date) row.get("expiration_date"));
        if (isCompanyExpiredOrUnset(exp, code)) {
          userHasExpired = true;
        } else {
          user = row;
          break;
        }
      }
    }

    if (user != null) {
      return finalizeUserLogin(user, rememberMe);
    }
    if (userPasswordMatch && userHasExpired) {
      return new LoginResult(false, "Company or Group has expired.", null);
    }

    return loginOwner(password, companyId, loginId);
  }

  private LoginResult finalizeUserLogin(Map<String, Object> user, boolean rememberMe) {
    int userId = ((Number) user.get("id")).intValue();
    int companyNumericId = ((Number) user.get("company_numeric_id")).intValue();
    String companyCode = user.get("company_code") != null ? String.valueOf(user.get("company_code")) : "";

    jdbc.update("UPDATE user SET last_login = NOW() WHERE id = ?", userId);

    String rememberToken = null;
    if (rememberMe) {
      rememberToken = randomRememberToken();
      jdbc.update(
          "UPDATE user SET remember_token = ?, remember_token_expires = DATE_ADD(NOW(), INTERVAL 30 DAY) WHERE id = ?",
          rememberToken,
          userId);
    }

    Map<String, Object> session = new HashMap<>();
    if (rememberToken != null) {
      session.put("_bootstrap_remember_token", rememberToken);
    }
    session.put("user_id", userId);
    session.put("login_id", String.valueOf(user.get("login_id")));
    session.put("name", user.get("name") != null ? String.valueOf(user.get("name")) : "");
    session.put("role", user.get("role") != null ? String.valueOf(user.get("role")) : "");
    session.put("user_type", "user");
    session.put("company_id", companyNumericId);
    session.put("company_code", companyCode);
    session.put("last_activity", (int) (System.currentTimeMillis() / 1000));
    Object ro = user.get("read_only");
    session.put("read_only", ro != null ? ((Number) ro).intValue() : 1);

    boolean needsSecondary = false;
    if ("C168".equalsIgnoreCase(companyCode)) {
      String sec = null;
      try {
        sec =
            jdbc.queryForObject(
                "SELECT secondary_password FROM user WHERE id = ?", String.class, userId);
      } catch (EmptyResultDataAccessException ignored) {
        // no row
      }
      needsSecondary = sec != null && !sec.isEmpty();
    }

    String nextRedirect;
    if (needsSecondary) {
      nextRedirect = "api/users/user_secondary_password.php";
    } else {
      session.put("secondary_password_verified", true);
      nextRedirect = "index.php?r=/dashboard";
    }

    String token = bootstrapStore.put(new Payload(nextRedirect, session));
    return new LoginResult(true, null, token);
  }

  private LoginResult loginOwner(String password, String companyId, String loginId) {
    String ownerSql =
        """
        SELECT o.*, c.id AS company_numeric_id, c.company_id AS company_code, c.expiration_date
        FROM owner o
        INNER JOIN company c ON c.owner_id = o.id
        WHERE UPPER(o.owner_code) = UPPER(?) AND (UPPER(c.company_id) = ? OR UPPER(c.group_id) = ?)
        """;
    List<Map<String, Object>> owners = jdbc.queryForList(ownerSql, loginId, companyId, companyId);

    Map<String, Object> owner = null;
    Map<String, Object> ownerPlainUpgrade = null;
    boolean ownerPasswordMatch = false;
    boolean ownerHasExpired = false;

    for (Map<String, Object> row : owners) {
      String hashed = row.get("password") != null ? String.valueOf(row.get("password")) : "";
      boolean valid = false;
      Map<String, Object> plainRow = null;
      if (!hashed.isEmpty() && passwordEncoder.matches(password, hashed)) {
        valid = true;
      } else if (password.equals(hashed)) {
        valid = true;
        plainRow = row;
      }
      if (valid) {
        ownerPasswordMatch = true;
        String code = row.get("company_code") != null ? String.valueOf(row.get("company_code")) : null;
        LocalDate exp = toLocalDate((Date) row.get("expiration_date"));
        if (isCompanyExpiredOrUnset(exp, code)) {
          ownerHasExpired = true;
        } else {
          owner = row;
          ownerPlainUpgrade = plainRow;
          break;
        }
      }
    }

    if (owner != null) {
      int oid = ((Number) owner.get("id")).intValue();
      if (ownerPlainUpgrade != null && oid == ((Number) ownerPlainUpgrade.get("id")).intValue()) {
        String newHash = passwordEncoder.encode(password);
        jdbc.update("UPDATE owner SET password = ? WHERE id = ?", newHash, oid);
      }

      int companyNum = ((Number) owner.get("company_numeric_id")).intValue();
      String ownerCode = owner.get("owner_code") != null ? String.valueOf(owner.get("owner_code")) : "";
      String companyCode = owner.get("company_code") != null ? String.valueOf(owner.get("company_code")) : "";
      String name = owner.get("name") != null ? String.valueOf(owner.get("name")) : "";

      Map<String, Object> session = new HashMap<>();
      session.put("user_id", oid);
      session.put("login_id", ownerCode);
      session.put("name", name);
      session.put("role", "owner");
      session.put("user_type", "owner");
      session.put("owner_id", oid);
      session.put("real_owner_id", oid);
      session.put("owner_code", ownerCode);
      session.put("company_id", companyNum);
      session.put("company_code", companyCode);
      session.put("last_activity", (int) (System.currentTimeMillis() / 1000));

      String token = bootstrapStore.put(new Payload("index.php?r=/dashboard", session));
      return new LoginResult(true, null, token);
    }

    if (ownerPasswordMatch && ownerHasExpired) {
      return new LoginResult(false, "Company or Group has expired.", null);
    }
    return new LoginResult(false, "Username or password is incorrect", null);
  }
}
