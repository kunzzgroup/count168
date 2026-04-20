package com.eazycount.web;

import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 根路径 HTML 由 {@link SpaLoginController}（Thymeleaf）提供；此处仅保留 JSON 元数据。
 */
@RestController
public class HomeController {

  @GetMapping("/api/meta")
  public ResponseEntity<Map<String, Object>> meta() {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("service", "eazycount-api");
    body.put("health", "/api/health");
    body.put("login", "POST /api/auth/login");
    return ResponseEntity.ok(body);
  }
}
