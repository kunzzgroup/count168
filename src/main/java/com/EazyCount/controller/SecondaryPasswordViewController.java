package com.EazyCount.controller;

import com.EazyCount.config.SpaProperties;
import jakarta.servlet.http.HttpSession;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/**
 * Placeholder for C168 secondary password flow ({@code user_secondary_password.php}).
 */
@Controller
public class SecondaryPasswordViewController {

    private final SpaProperties spaProperties;

    public SecondaryPasswordViewController(SpaProperties spaProperties) {
        this.spaProperties = spaProperties;
    }

    @GetMapping("/secondary-password")
    public String secondaryPasswordPage(HttpSession session) {
        if (session.getAttribute("user_id") == null) {
            return "redirect:" + spaProperties.toRedirect("/login");
        }
        return "redirect:" + spaProperties.toRedirect("/secondary-password");
    }
}
