package com.eazycount.company;

import java.util.HashMap;
import java.util.Map;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 对应原 api/company/verify_api.php（登录页公司 ID 校验）。
 */
@RestController
@RequestMapping("/api/company")
public class CompanyVerifyController {

  private final JdbcTemplate jdbc;

  public CompanyVerifyController(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  @PostMapping("/verify")
  public ResponseEntity<Map<String, Object>> verify(@RequestParam("company_id") String companyIdRaw) {
    String companyId = companyIdRaw == null ? "" : companyIdRaw.trim();
    Map<String, Object> body = new HashMap<>();
    if (companyId.isEmpty()) {
      body.put("success", false);
      body.put("message", "请输入公司ID");
      body.put("data", null);
      return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(body);
    }

    String sql =
        "SELECT id, company_id AS company_name FROM company WHERE UPPER(company_id) = UPPER(?) OR UPPER(group_id) = UPPER(?) LIMIT 1";
    String companyName;
    try {
      companyName = jdbc.queryForObject(sql, (rs, rowNum) -> rs.getString("company_name"), companyId, companyId);
    } catch (EmptyResultDataAccessException e) {
      body.put("success", false);
      body.put("message", "公司ID不存在");
      body.put("data", null);
      return ResponseEntity.status(HttpStatus.NOT_FOUND).body(body);
    } catch (Exception e) {
      body.put("success", false);
      body.put("message", "数据库错误，请稍后重试");
      body.put("data", null);
      return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(body);
    }

    Map<String, Object> data = new HashMap<>();
    data.put("company_name", companyName);
    body.put("success", true);
    body.put("message", "公司ID有效");
    body.put("data", data);
    return ResponseEntity.ok(body);
  }
}
