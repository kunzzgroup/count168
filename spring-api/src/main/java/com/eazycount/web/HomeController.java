package com.eazycount.web;

import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 根路径说明：浏览器打开 8090 根目录时不再出现 Whitelabel 404；业务接口均在 /api/**。
 */
@RestController
public class HomeController {

  /**
   * 不能写 produces = application/json only：浏览器访问根 URL 时 Accept 以 text/html 为主，会匹配不到而 404。
   */
  @GetMapping("/")
  public ResponseEntity<Map<String, Object>> root() {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("service", "eazycount-api");
    body.put("health", "/api/health");
    body.put("login", "POST /api/auth/login");
    return ResponseEntity.ok(body);
  }
}
