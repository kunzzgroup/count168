package com.EazyCount.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Base URL of the React SPA (Vite dev server or static host). Used for browser redirects from
 * Spring MVC routes that previously returned Thymeleaf views.
 */
@Component
@ConfigurationProperties(prefix = "eazycount.spa")
public class SpaProperties {

    /**
     * No trailing slash, e.g. {@code http://localhost:5173}.
     */
    private String baseUrl = "http://localhost:5173";

    public String getBaseUrl() {
        return baseUrl;
    }

    public void setBaseUrl(String baseUrl) {
        this.baseUrl = baseUrl;
    }

    public String toRedirect(String path) {
        String base = getBaseUrl() == null ? "" : getBaseUrl().trim();
        while (base.endsWith("/")) {
            base = base.substring(0, base.length() - 1);
        }
        if (path == null || path.isBlank()) {
            return base;
        }
        String p = path.startsWith("/") ? path : "/" + path;
        return base + p;
    }
}
