package com.eazycount.web;

import com.eazycount.config.AppProperties;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;

/**
 * React 登录壳（Thymeleaf），替代 PHP index.php 未登录分支。
 */
@Controller
public class SpaLoginController {

  private final AppProperties appProperties;

  public SpaLoginController(AppProperties appProperties) {
    this.appProperties = appProperties;
  }

  @GetMapping({"/", "/login"})
  public String loginSpa(Model model) {
    model.addAttribute("spaDefaultRoute", "/login");
    String bootstrap = appProperties.getPublicLoginBootstrapUrl();
    model.addAttribute("loginBootstrapUrl", bootstrap != null ? bootstrap : "");
    String apiBase = appProperties.getBrowserApiBase();
    model.addAttribute("browserApiBase", apiBase != null ? apiBase : "");
    return "login-spa";
  }
}
