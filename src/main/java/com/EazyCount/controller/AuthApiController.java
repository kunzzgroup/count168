package com.EazyCount.controller;

import com.EazyCount.service.AuthService;
import com.EazyCount.service.AuthService.LoginResult;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * JSON session helpers for SPA clients; login uses the same {@link AuthService} rules as
 * {@code login_process.php} and the React login form.
 */
@RestController
@RequestMapping("/api/auth")
public class AuthApiController {

    private final AuthService authService;

    public AuthApiController(AuthService authService) {
        this.authService = authService;
    }

    @GetMapping("/session")
    public Map<String, Object> session(HttpSession session) {
        Object uid = session.getAttribute("user_id");
        if (uid == null) {
            return Map.of("authenticated", false);
        }
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("authenticated", true);
        m.put("userId", uid);
        m.put("loginId", session.getAttribute("login_id"));
        m.put("name", session.getAttribute("name"));
        m.put("role", session.getAttribute("role"));
        m.put("userType", session.getAttribute("user_type"));
        m.put("companyId", session.getAttribute("company_id"));
        m.put("companyCode", session.getAttribute("company_code"));
        m.put("secondaryPasswordVerified", session.getAttribute("secondary_password_verified"));
        return m;
    }

    @PostMapping("/login")
    public Map<String, Object> login(
            @RequestBody Map<String, Object> body,
            HttpServletRequest request,
            HttpServletResponse response) {
        LoginResult r = authService.loginFromJsonBody(body, request, response);
        if (!r.success()) {
            Map<String, Object> err = new LinkedHashMap<>();
            err.put("status", "error");
            err.put("message", r.message());
            return err;
        }
        Map<String, Object> ok = new LinkedHashMap<>();
        ok.put("status", "success");
        ok.put("redirect", r.redirect());
        return ok;
    }

    @PostMapping("/logout")
    public Map<String, Object> logout(HttpServletRequest request, HttpServletResponse response) {
        authService.logout(request, response);
        return Map.of("status", "success");
    }
}
