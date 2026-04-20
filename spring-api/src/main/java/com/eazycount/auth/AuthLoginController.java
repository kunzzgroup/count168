package com.eazycount.auth;

import jakarta.servlet.http.HttpServletRequest;
import java.util.HashMap;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AuthLoginController {

  private final LoginService loginService;

  public AuthLoginController(LoginService loginService) {
    this.loginService = loginService;
  }

  @PostMapping("/api/auth/login")
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
      body.put("status", "error");
      body.put("message", r.message() != null ? r.message() : "Login failed");
      return ResponseEntity.ok(body);
    }

    body.put("status", "success");
    body.put("bootstrapToken", r.bootstrapToken());
    return ResponseEntity.ok(body);
  }
}
