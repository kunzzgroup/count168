package com.eazycount.auth;

import jakarta.servlet.http.HttpServletRequest;
import java.util.HashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AuthLoginController {

  private static final Logger log = LoggerFactory.getLogger(AuthLoginController.class);

  private final LoginService loginService;

  public AuthLoginController(LoginService loginService) {
    this.loginService = loginService;
  }

  @PostMapping(value = "/api/auth/login", produces = MediaType.APPLICATION_JSON_VALUE)
  public ResponseEntity<Map<String, Object>> login(HttpServletRequest req) {
    LoginService.LoginResult r =
        loginService.login(
            req.getParameter("password"),
            req.getParameter("company_id"),
            req.getParameter("login_role"),
            req.getParameter("account_id"),
            req.getParameter("login_id"),
            req.getParameter("remember_me"));

    Map<String, Object> body = new HashMap<>();
    if (!r.success()) {
      log.debug("Login rejected: {}", r.message());
      body.put("status", "error");
      body.put("message", r.message() != null ? r.message() : "Login failed");
      return ResponseEntity.ok(body);
    }

    if (r.bootstrapToken() == null || r.bootstrapToken().isEmpty()) {
      log.error("Login succeeded but bootstrap token missing");
      body.put("status", "error");
      body.put("message", "Login session error, please try again");
      return ResponseEntity.ok(body);
    }

    body.put("status", "success");
    body.put("bootstrapToken", r.bootstrapToken());
    return ResponseEntity.ok(body);
  }
}
