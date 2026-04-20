package com.eazycount.web;

import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 根路径说明：浏览器打开 8090 根目录时不再出现 Whitelabel 404；业务接口均在 /api/**。
 */
@RestController
public class HomeController {

  @GetMapping(value = "/", produces = MediaType.APPLICATION_JSON_VALUE)
  public ResponseEntity<Map<String, Object>> root() {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("service", "eazycount-api");
    body.put("health", "/api/health");
    body.put("login", "POST /api/auth/login");
    return ResponseEntity.ok(body);
  }
}
