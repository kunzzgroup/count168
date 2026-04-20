package com.eazycount;

import com.eazycount.config.AppProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties(AppProperties.class)
public class EazycountApplication {

  public static void main(String[] args) {
    SpringApplication.run(EazycountApplication.class, args);
  }
}
