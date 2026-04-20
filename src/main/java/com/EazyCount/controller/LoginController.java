package com.EazyCount.controller;

import com.EazyCount.config.SpaProperties;
import com.EazyCount.service.AuthService;
import com.EazyCount.service.AuthService.LoginResult;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import java.nio.charset.StandardCharsets;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.util.UriComponentsBuilder;

@Controller
public class LoginController {

    private final AuthService authService;
    private final SpaProperties spaProperties;

    public LoginController(AuthService authService, SpaProperties spaProperties) {
        this.authService = authService;
        this.spaProperties = spaProperties;
    }

    @GetMapping("/login")
    public String loginPage(HttpSession session) {
        if (session.getAttribute("user_id") != null) {
            if (!Boolean.TRUE.equals(session.getAttribute("secondary_password_verified"))) {
                return "redirect:" + spaProperties.toRedirect("/secondary-password");
            }
            return "redirect:" + spaProperties.toRedirect("/dashboard");
        }
        return "redirect:" + spaProperties.toRedirect("/login");
    }

    @PostMapping("/login")
    public String loginSubmit(
            @RequestParam("company_id") String companyId,
            @RequestParam("password") String password,
            @RequestParam(value = "login_role", defaultValue = "admin") String loginRole,
            @RequestParam(value = "login_id", required = false) String loginId,
            @RequestParam(value = "account_id", required = false) String accountId,
            @RequestParam(value = "remember_me", defaultValue = "false") String rememberMeRaw,
            HttpServletRequest request,
            HttpServletResponse response) {
        String company = companyId == null ? "" : companyId.trim().toUpperCase();
        boolean remember = "1".equals(rememberMeRaw) || "true".equalsIgnoreCase(rememberMeRaw);
        LoginResult result =
                authService.loginFromForm(company, password, loginRole, loginId, accountId, remember, request, response);
        if (!result.success()) {
            String target =
                    UriComponentsBuilder.fromUriString(spaProperties.toRedirect("/login"))
                            .queryParam("error", result.message() != null ? result.message() : "")
                            .queryParam("company_id", companyId != null ? companyId : "")
                            .queryParam("login_id", loginId != null ? loginId : "")
                            .queryParam("account_id", accountId != null ? accountId : "")
                            .queryParam("login_role", loginRole != null ? loginRole : "admin")
                            .encode(StandardCharsets.UTF_8)
                            .build()
                            .toUriString();
            return "redirect:" + target;
        }
        return "redirect:" + spaProperties.toRedirect(result.redirect());
    }

    @GetMapping("/logout")
    public String logoutGet(HttpServletRequest request, HttpServletResponse response) {
        authService.logout(request, response);
        return "redirect:" + spaProperties.toRedirect("/login");
    }

    @PostMapping("/logout")
    public String logoutPost(HttpServletRequest request, HttpServletResponse response) {
        authService.logout(request, response);
        return "redirect:" + spaProperties.toRedirect("/login");
    }
}
