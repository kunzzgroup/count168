package com.eazycount.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app")
public class AppProperties {

  /**
   * 与 PHP login_bootstrap.php 调用 /api/internal/session-bootstrap 时请求头一致。
   */
  private String internalBootstrapKey = "";

  public String getInternalBootstrapKey() {
    return internalBootstrapKey;
  }

  @SuppressWarnings("unused")
  public void setInternalBootstrapKey(String internalBootstrapKey) {
    this.internalBootstrapKey = internalBootstrapKey;
  }
}
