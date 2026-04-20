package com.eazycount.domain;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 自 api/domain/domain_api.php 迁移（分阶段）。当前实现：get_company_permissions、get_companies。
 * 请求体：JSON，须含 "action" 字段，与 PHP 一致。
 */
@RestController
@RequestMapping("/api/domain")
public class DomainApiController {

  private final JdbcTemplate jdbc;
  private final ObjectMapper objectMapper;

  public DomainApiController(JdbcTemplate jdbc, ObjectMapper objectMapper) {
    this.jdbc = jdbc;
    this.objectMapper = objectMapper;
  }

  @PostMapping(
      consumes = MediaType.APPLICATION_JSON_VALUE,
      produces = MediaType.APPLICATION_JSON_VALUE)
  public ResponseEntity<Map<String, Object>> handle(@RequestBody JsonNode body) {
    String action = body.path("action").asText("");
    return switch (action) {
      case "get_company_permissions" -> getCompanyPermissions(body);
      case "get_companies" -> getCompanies(body);
      default -> {
        Map<String, Object> err = new HashMap<>();
        err.put("success", false);
        err.put("message", "Domain action not migrated to Spring yet: " + action);
        err.put("data", null);
        yield ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED).body(err);
      }
    };
  }

  private static Map<String, Object> jsonFail(String message) {
    Map<String, Object> m = new HashMap<>();
    m.put("success", false);
    m.put("message", message);
    m.put("data", null);
    return m;
  }

  private ResponseEntity<Map<String, Object>> getCompanyPermissions(JsonNode body) {
    String companyId = body.path("company_id").asText("").trim();
    if (companyId.isEmpty()) {
      return ResponseEntity.ok(jsonFail("Invalid company ID"));
    }
    String code = companyId.toUpperCase();
    try {
      String json =
          jdbc.query(
              "SELECT permissions FROM company WHERE company_id = ?",
              rs -> (rs.next() ? rs.getString("permissions") : null),
              code);
      List<String> permissions = parsePermissionsJson(json);
      Map<String, Object> data = new HashMap<>();
      data.put("permissions", permissions);
      return ResponseEntity.ok(Map.of("success", true, "message", "OK", "data", data));
    } catch (DataAccessException e) {
      return ResponseEntity.ok(jsonFail("Error: " + e.getMessage()));
    }
  }

  private List<String> parsePermissionsJson(String json) {
    if (json == null || json.isBlank()) {
      return List.of();
    }
    try {
      JsonNode n = objectMapper.readTree(json);
      if (!n.isArray()) {
        return List.of();
      }
      List<String> out = new ArrayList<>();
      for (JsonNode x : n) {
        if (x.isTextual()) {
          out.add(x.asText());
        }
      }
      return out;
    } catch (Exception e) {
      return List.of();
    }
  }

  private ResponseEntity<Map<String, Object>> getCompanies(JsonNode body) {
    long ownerId = body.path("owner_id").asLong(0);
    if (ownerId <= 0) {
      return ResponseEntity.ok(jsonFail("Invalid owner ID"));
    }
    try {
      List<Map<String, Object>> companies =
          jdbc.query(
              """
              SELECT company_id, expiration_date, permissions, group_id, fee_share_allocations
              FROM company WHERE owner_id = ? ORDER BY company_id
              """,
              (rs, rowNum) -> {
                Map<String, Object> row = new HashMap<>();
                row.put("company_id", rs.getString("company_id"));
                row.put("expiration_date", rs.getObject("expiration_date"));
                String perms = rs.getString("permissions");
                row.put("permissions", parsePermissionsArray(perms));
                row.put("group_id", rs.getString("group_id"));
                Object feeRaw = rs.getObject("fee_share_allocations");
                row.put(
                    "fee_share_allocations",
                    FeeShareAllocationsNormalizer.normalize(feeRaw));
                return row;
              },
              ownerId);
      Map<String, Object> data = new HashMap<>();
      data.put("companies", companies);
      return ResponseEntity.ok(Map.of("success", true, "message", "OK", "data", data));
    } catch (DataAccessException e) {
      return ResponseEntity.ok(jsonFail("Error: " + e.getMessage()));
    }
  }

  private List<String> parsePermissionsArray(String perms) {
    if (perms == null || perms.isBlank()) {
      return List.of();
    }
    try {
      JsonNode n = objectMapper.readTree(perms);
      if (!n.isArray()) {
        return List.of();
      }
      List<String> out = new ArrayList<>();
      for (JsonNode x : n) {
        if (x.isTextual()) {
          out.add(x.asText());
        }
      }
      return out;
    } catch (Exception e) {
      return List.of();
    }
  }
}
