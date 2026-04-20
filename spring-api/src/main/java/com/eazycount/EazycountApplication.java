package com.eazycount;

import com.eazycount.config.AppProperties;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication(exclude = {UserDetailsServiceAutoConfiguration.class})
@MapperScan("com.eazycount.auth.mapper")
@EnableConfigurationProperties(AppProperties.class)
public class EazycountApplication {

  public static void main(String[] args) {
    SpringApplication.run(EazycountApplication.class, args);
  }
}
