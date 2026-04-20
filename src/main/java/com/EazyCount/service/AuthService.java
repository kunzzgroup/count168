package com.EazyCount.service;

import com.EazyCount.dao.AuthAccountMapper;
import com.EazyCount.dao.AuthOwnerMapper;
import com.EazyCount.dao.AuthUserMapper;
import com.EazyCount.entity.MemberAccountRow;
import com.EazyCount.entity.OwnerCompanyRow;
import com.EazyCount.entity.UserCompanyRow;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import java.security.SecureRandom;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
public class AuthService {

    private static final ZoneId ASIA_KL = ZoneId.of("Asia/Kuala_Lumpur");

    private final AuthUserMapper authUserMapper;
    private final AuthAccountMapper authAccountMapper;
    private final AuthOwnerMapper authOwnerMapper;
    private final PasswordEncoder passwordEncoder;
    private final SecureRandom secureRandom = new SecureRandom();

    public AuthService(
            AuthUserMapper authUserMapper,
            AuthAccountMapper authAccountMapper,
            AuthOwnerMapper authOwnerMapper,
            PasswordEncoder passwordEncoder) {
        this.authUserMapper = authUserMapper;
        this.authAccountMapper = authAccountMapper;
        this.authOwnerMapper = authOwnerMapper;
        this.passwordEncoder = passwordEncoder;
    }

    /**
     * Same rules as {@code login_process.php}: C168 ignores expiration; others block unset or past dates.
     */
    public static boolean isCompanyExpiredOrUnset(LocalDate expirationDate, String companyCode) {
        if (companyCode != null && "C168".equalsIgnoreCase(companyCode.trim())) {
            return false;
        }
        if (expirationDate == null) {
            return true;
        }
        LocalDate today = LocalDate.now(ASIA_KL);
        return expirationDate.isBefore(today);
    }

    public LoginResult loginFromForm(
            String companyIdUpper,
            String password,
            String loginRole,
            String loginId,
            String accountId,
            boolean rememberMe,
            HttpServletRequest request,
            HttpServletResponse response) {
        try {
            if (!StringUtils.hasText(companyIdUpper) || !StringUtils.hasText(password)) {
                return LoginResult.error("Company ID and password are required");
            }
            if ("member".equalsIgnoreCase(loginRole)) {
                return loginMember(companyIdUpper, password, accountId, request, response);
            }
            return loginAdminOrOwner(companyIdUpper, password, loginId, rememberMe, request, response);
        } catch (Exception ex) {
            return LoginResult.error("Database error, please try again later");
        }
    }

    public LoginResult loginFromJsonBody(
            Map<String, Object> body, HttpServletRequest request, HttpServletResponse response) {
        String companyId = str(body.get("companyId")).toUpperCase();
        String password = str(body.get("password"));
        String loginRole = str(body.get("loginRole"));
        if (!StringUtils.hasText(loginRole)) {
            loginRole = "admin";
        }
        String loginId = str(body.get("loginId"));
        String accountId = firstNonBlank(str(body.get("accountId")), loginId);
        boolean remember = rememberMe(body);
        return loginFromForm(companyId, password, loginRole, loginId, accountId, remember, request, response);
    }

    private LoginResult loginMember(
            String companyId,
            String password,
            String accountId,
            HttpServletRequest request,
            HttpServletResponse response) {
        if (!StringUtils.hasText(accountId)) {
            return LoginResult.error("Please enter account ID");
        }
        List<MemberAccountRow> rows = authAccountMapper.selectMemberAccounts(accountId, companyId);
        MemberAccountRow match = null;
        boolean passwordMatch = false;
        boolean expired = false;

        for (MemberAccountRow row : rows) {
            if (StringUtils.hasText(row.getPassword()) && password.equals(row.getPassword())) {
                passwordMatch = true;
                if (isCompanyExpiredOrUnset(row.getExpirationDate(), row.getCompanyCode())) {
                    expired = true;
                } else {
                    match = row;
                    break;
                }
            }
        }

        if (match != null) {
            HttpSession session = request.getSession(true);
            session.setAttribute("member_login_account_id", match.getId());
            session.setAttribute("user_id", match.getId());
            session.setAttribute("login_id", match.getAccountId());
            session.setAttribute("name", match.getName());
            session.setAttribute("role", match.getRole());
            session.setAttribute("user_type", "member");
            session.setAttribute("account_id", match.getAccountId());
            session.setAttribute("company_id", match.getCompanyNumericId());
            session.setAttribute("company_code", match.getCompanyCode());
            session.setAttribute("last_activity", System.currentTimeMillis() / 1000);
            session.setAttribute("secondary_password_verified", Boolean.TRUE);
            authAccountMapper.updateAccountLastLogin(match.getId());
            return LoginResult.ok("/dashboard");
        }
        if (passwordMatch && expired) {
            return LoginResult.error("Company or Group has expired.");
        }
        return LoginResult.error("Account ID, Company ID or password is incorrect");
    }

    private LoginResult loginAdminOrOwner(
            String companyId,
            String password,
            String loginId,
            boolean rememberMe,
            HttpServletRequest request,
            HttpServletResponse response) {
        if (!StringUtils.hasText(loginId)) {
            return LoginResult.error("Please enter username");
        }

        List<UserCompanyRow> users = authUserMapper.selectAdminCandidates(loginId, companyId);
        UserCompanyRow user = null;
        boolean userPasswordMatch = false;
        boolean userExpired = false;

        for (UserCompanyRow row : users) {
            if (StringUtils.hasText(row.getPassword()) && matchesPhpBcrypt(password, row.getPassword())) {
                userPasswordMatch = true;
                if (isCompanyExpiredOrUnset(row.getExpirationDate(), row.getCompanyCode())) {
                    userExpired = true;
                } else {
                    user = row;
                    break;
                }
            }
        }

        if (user != null) {
            return finalizeUserLogin(user, rememberMe, request, response);
        }
        if (userPasswordMatch && userExpired) {
            return LoginResult.error("Company or Group has expired.");
        }

        List<OwnerCompanyRow> owners = authOwnerMapper.selectOwnerCandidates(loginId, companyId);
        OwnerCompanyRow owner = null;
        boolean ownerPasswordMatch = false;
        boolean ownerExpired = false;
        OwnerCompanyRow ownerToUpgrade = null;

        for (OwnerCompanyRow row : owners) {
            boolean valid = false;
            if (StringUtils.hasText(row.getPassword()) && matchesPhpBcrypt(password, row.getPassword())) {
                valid = true;
            } else if (StringUtils.hasText(row.getPassword()) && password.equals(row.getPassword())) {
                valid = true;
                ownerToUpgrade = row;
            }
            if (valid) {
                ownerPasswordMatch = true;
                if (isCompanyExpiredOrUnset(row.getExpirationDate(), row.getCompanyCode())) {
                    ownerExpired = true;
                } else {
                    owner = row;
                    break;
                }
            }
        }

        if (owner != null) {
            if (ownerToUpgrade != null && ownerToUpgrade.getId().equals(owner.getId())) {
                String hash = passwordEncoder.encode(password);
                authOwnerMapper.updateOwnerPassword(owner.getId(), hash);
            }
            HttpSession session = request.getSession(true);
            session.setAttribute("user_id", owner.getId());
            session.setAttribute("login_id", owner.getOwnerCode());
            session.setAttribute("name", owner.getName());
            session.setAttribute("role", "owner");
            session.setAttribute("user_type", "owner");
            session.setAttribute("owner_id", owner.getId());
            session.setAttribute("real_owner_id", owner.getId());
            session.setAttribute("owner_code", owner.getOwnerCode());
            session.setAttribute("company_id", owner.getCompanyNumericId());
            session.setAttribute("company_code", owner.getCompanyCode());
            session.setAttribute("last_activity", System.currentTimeMillis() / 1000);
            session.setAttribute("secondary_password_verified", Boolean.TRUE);
            return LoginResult.ok("/dashboard");
        }
        if (ownerPasswordMatch && ownerExpired) {
            return LoginResult.error("Company or Group has expired.");
        }
        return LoginResult.error("Username or password is incorrect");
    }

    private LoginResult finalizeUserLogin(
            UserCompanyRow user, boolean rememberMe, HttpServletRequest request, HttpServletResponse response) {
        HttpSession session = request.getSession(true);
        session.setAttribute("user_id", user.getId());
        session.setAttribute("login_id", user.getLoginId());
        session.setAttribute("name", user.getName());
        session.setAttribute("role", user.getRole());
        session.setAttribute("user_type", "user");
        session.setAttribute("company_id", user.getCompanyNumericId());
        session.setAttribute("company_code", user.getCompanyCode());
        session.setAttribute("last_activity", System.currentTimeMillis() / 1000);
        session.setAttribute("read_only", 1);

        if (rememberMe) {
            byte[] bytes = new byte[32];
            secureRandom.nextBytes(bytes);
            String token = HexFormat.of().formatHex(bytes);
            authUserMapper.updateRememberToken(user.getId(), token);
            ResponseCookie cookie = ResponseCookie.from("remember_token", token)
                    .httpOnly(true)
                    .path("/")
                    .maxAge(30L * 24 * 60 * 60)
                    .sameSite("Lax")
                    .build();
            response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
        }

        authUserMapper.updateLastLogin(user.getId());

        boolean needsSecondary = false;
        if ("C168".equalsIgnoreCase(user.getCompanyCode())) {
            String sec = authUserMapper.selectSecondaryPassword(user.getId());
            needsSecondary = StringUtils.hasText(sec);
        }

        if (needsSecondary) {
            return LoginResult.ok("/secondary-password");
        }

        session.setAttribute("secondary_password_verified", Boolean.TRUE);
        return LoginResult.ok("/dashboard");
    }

    public void logout(HttpServletRequest request, HttpServletResponse response) {
        HttpSession session = request.getSession(false);
        if (session != null) {
            session.invalidate();
        }
        ResponseCookie clear = ResponseCookie.from("remember_token", "")
                .httpOnly(true)
                .path("/")
                .maxAge(0)
                .sameSite("Lax")
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, clear.toString());
    }

    private boolean matchesPhpBcrypt(String raw, String storedHash) {
        if (!StringUtils.hasText(storedHash)) {
            return false;
        }
        String normalized = phpBcryptToJava(storedHash);
        try {
            return passwordEncoder.matches(raw, normalized);
        } catch (IllegalArgumentException ex) {
            return false;
        }
    }

    private static String phpBcryptToJava(String hash) {
        if (hash != null && hash.startsWith("$2y$")) {
            return "$2a$" + hash.substring(4);
        }
        return hash;
    }

    private static boolean rememberMe(Map<String, Object> body) {
        Object v = body.get("rememberMe");
        if (Boolean.TRUE.equals(v) || "1".equals(String.valueOf(v))) {
            return true;
        }
        Object v2 = body.get("remember_me");
        return "1".equals(String.valueOf(v2)) || Boolean.TRUE.equals(v2);
    }

    private static String str(Object o) {
        return o == null ? "" : String.valueOf(o).trim();
    }

    private static String firstNonBlank(String a, String b) {
        return StringUtils.hasText(a) ? a : b;
    }

    public record LoginResult(boolean success, String message, String redirect) {
        public static LoginResult ok(String redirect) {
            return new LoginResult(true, null, redirect);
        }

        public static LoginResult error(String message) {
            return new LoginResult(false, message, null);
        }
    }
}
