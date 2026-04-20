package com.eazycount.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app")
public class AppProperties {

  /**
   * 与 PHP login_bootstrap.php 调用 /api/internal/session-bootstrap 时请求头一致。
   */
  private String internalBootstrapKey = "";

  /**
   * 浏览器登录成功后跳转的 PHP login_bootstrap 完整地址（含 scheme/host/path）。空字符串表示由前端使用相对路径
   * login_bootstrap.php（页面若由 Thymeleaf 同域提供则需配置此项指向线上 PHP）。
   */
  private String publicLoginBootstrapUrl = "";

  /** 浏览器请求 API 的 Spring 根地址（无尾斜杠）；空则页内脚本推断（本机→8090，否则与页面同 origin）。 */
  private String browserApiBase = "";

  public String getInternalBootstrapKey() {
    return internalBootstrapKey;
  }

  @SuppressWarnings("unused")
  public void setInternalBootstrapKey(String internalBootstrapKey) {
    this.internalBootstrapKey = internalBootstrapKey;
  }

  public String getPublicLoginBootstrapUrl() {
    return publicLoginBootstrapUrl;
  }

  @SuppressWarnings("unused")
  public void setPublicLoginBootstrapUrl(String publicLoginBootstrapUrl) {
    this.publicLoginBootstrapUrl = publicLoginBootstrapUrl;
  }

  public String getBrowserApiBase() {
    return browserApiBase;
  }

  @SuppressWarnings("unused")
  public void setBrowserApiBase(String browserApiBase) {
    this.browserApiBase = browserApiBase;
  }
}
