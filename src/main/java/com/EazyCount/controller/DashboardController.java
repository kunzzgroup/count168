package com.EazyCount.controller;

import com.EazyCount.config.SpaProperties;
import jakarta.servlet.http.HttpSession;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;

@Controller
public class DashboardController {

    private static final DateTimeFormatter ISO = DateTimeFormatter.ISO_LOCAL_DATE;

    private final SpaProperties spaProperties;

    public DashboardController(SpaProperties spaProperties) {
        this.spaProperties = spaProperties;
    }

    @GetMapping("/dashboard")
    public String dashboard(HttpSession session) {
        if (session.getAttribute("user_id") == null) {
            return "redirect:" + spaProperties.toRedirect("/login");
        }
        if (!Boolean.TRUE.equals(session.getAttribute("secondary_password_verified"))) {
            return "redirect:" + spaProperties.toRedirect("/secondary-password");
        }
        return "redirect:" + spaProperties.toRedirect("/dashboard");
    }

    @GetMapping("/api/transactions/dashboard")
    @ResponseBody
    public ResponseEntity<?> dashboardData(
            @RequestParam(value = "date_from", required = false)
                    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
                    LocalDate dateFrom,
            @RequestParam(value = "date_to", required = false)
                    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
                    LocalDate dateTo,
            @RequestParam(value = "company_id", required = false) Long companyIdParam,
            HttpSession session) {
        if (session.getAttribute("user_id") == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("success", false, "message", "Not logged in", "data", (Object) null));
        }

        LocalDate to = dateTo != null ? dateTo : LocalDate.now();
        LocalDate from = dateFrom != null ? dateFrom : to.withDayOfMonth(1);
        if (from.isAfter(to)) {
            LocalDate t = from;
            from = to;
            to = t;
        }

        Object sessionCompany = session.getAttribute("company_id");
        long companyId = companyIdParam != null ? companyIdParam : (sessionCompany instanceof Number n ? n.longValue() : 1L);

        Map<String, Object> data = buildSyntheticDashboard(from, to, companyId);
        return ResponseEntity.ok(Map.of("success", true, "data", data));
    }

    /**
     * Deterministic pseudo-random walk so charts look alive while staying reproducible per company id.
     */
    private static Map<String, Object> buildSyntheticDashboard(LocalDate from, LocalDate to, long companyId) {
        long days = ChronoUnit.DAYS.between(from, to) + 1;
        if (days > 120) {
            days = 120;
            to = from.plusDays(119);
        }

        Map<String, Double> capDaily = new LinkedHashMap<>();
        Map<String, Double> expDaily = new LinkedHashMap<>();
        Map<String, Double> profDaily = new LinkedHashMap<>();
        Map<String, Double> flowDaily = new LinkedHashMap<>();

        double c = 1200 + (companyId % 7) * 80;
        double e = 800 + (companyId % 5) * 40;
        double p = 400 + (companyId % 4) * 50;

        LocalDate d = from;
        int i = 0;
        while (!d.isAfter(to)) {
            String key = ISO.format(d);
            double w = Math.sin((i + companyId) * 0.35) * 120 + pseudoNoise(companyId, i) * 40;
            capDaily.put(key, w * 0.6);
            expDaily.put(key, -Math.abs(w * 0.35) - 20);
            profDaily.put(key, w * 0.25 + pseudoNoise(companyId, i + 3) * 15);
            flowDaily.put(key, w * 0.1);
            c += capDaily.get(key);
            e += expDaily.get(key);
            p += profDaily.get(key);
            d = d.plusDays(1);
            i++;
        }

        double periodCap = capDaily.values().stream().mapToDouble(Double::doubleValue).sum();
        double periodExp = expDaily.values().stream().mapToDouble(Double::doubleValue).sum();
        double periodProf = profDaily.values().stream().mapToDouble(Double::doubleValue).sum();

        double bfCap = 5000 + companyId * 10;
        double bfExp = -3200 - companyId * 5;
        double bfProf = 2100 + companyId * 3;

        Map<String, Object> daily = new LinkedHashMap<>();
        daily.put("capital", capDaily);
        daily.put("expenses", expDaily);
        daily.put("profit", profDaily);
        daily.put("profit_payment_flow_daily", flowDaily);

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("capital", bfCap + periodCap);
        data.put("expenses", bfExp + periodExp);
        data.put("profit", bfProf + periodProf);
        data.put("ownership_percentage", 0.0);
        data.put("has_ownership_setup", false);
        data.put("group_equity_percentage", 0.0);
        data.put("group_account_percentage", 0.0);
        data.put("has_group_ownership", false);
        data.put(
                "period_total",
                Map.of("capital", periodCap, "expenses", periodExp, "profit", periodProf));
        data.put(
                "initial_balance",
                Map.of("capital", bfCap, "expenses", bfExp, "profit", bfProf));
        data.put("daily_data", daily);
        data.put("date_range", Map.of("from", ISO.format(from), "to", ISO.format(to)));
        return data;
    }

    private static double pseudoNoise(long seed, int i) {
        long x = seed * 1315423911L + i * 2654435761L;
        return ((x & 0xffff) / 65535.0) - 0.5;
    }
}
