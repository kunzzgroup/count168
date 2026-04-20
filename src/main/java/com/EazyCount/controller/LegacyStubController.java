package com.EazyCount.controller;

import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Stand-in for legacy PHP endpoints referenced by migrated JSX placeholders.
 */
@RestController
@RequestMapping("/api/legacy")
public class LegacyStubController {

    @GetMapping("/stub")
    public Map<String, Object> stub(@RequestParam("php") String php) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("legacyPhp", php);
        body.put("message", "Not implemented — replace with a Spring REST endpoint when this screen is ported.");
        return body;
    }
}
