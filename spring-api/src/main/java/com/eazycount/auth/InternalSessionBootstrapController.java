package com.eazycount.auth;

import com.eazycount.auth.SessionBootstrapStore.Payload;
import com.eazycount.config.AppProperties;
import java.util.HashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

/**
 * 供 PHP login_bootstrap.php 服务端拉取一次性会话载荷（不可暴露给浏览器匿名调用）。
 */
@RestController
public class InternalSessionBootstrapController {

  private final SessionBootstrapStore bootstrapStore;
  private final AppProperties appProperties;

  public InternalSessionBootstrapController(SessionBootstrapStore bootstrapStore, AppProperties appProperties) {
    this.bootstrapStore = bootstrapStore;
    this.appProperties = appProperties;
  }

  @GetMapping("/api/internal/session-bootstrap/{token}")
  public ResponseEntity<Map<String, Object>> consume(
      @PathVariable String token, @RequestHeader(value = "X-Eazycount-Internal", required = false) String internalKey) {
    String expected = appProperties.getInternalBootstrapKey();
    if (expected == null || expected.isEmpty() || !expected.equals(internalKey)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    Payload payload = bootstrapStore.take(token);
    if (payload == null) {
      return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
    }

    Map<String, Object> body = new HashMap<>();
    body.put("nextRedirect", payload.nextRedirect());
    body.put("session", payload.sessionAttributes());
    return ResponseEntity.ok(body);
  }
}
