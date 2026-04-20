package com.EazyCount.controller;

import com.EazyCount.config.SpaProperties;
import jakarta.servlet.http.HttpSession;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class HomeController {

    private final SpaProperties spaProperties;

    public HomeController(SpaProperties spaProperties) {
        this.spaProperties = spaProperties;
    }

    @GetMapping("/")
    public String home(HttpSession session) {
        if (session.getAttribute("user_id") != null) {
            if (!Boolean.TRUE.equals(session.getAttribute("secondary_password_verified"))) {
                return "redirect:" + spaProperties.toRedirect("/secondary-password");
            }
            return "redirect:" + spaProperties.toRedirect("/dashboard");
        }
        return "redirect:" + spaProperties.toRedirect("/login");
    }
}
