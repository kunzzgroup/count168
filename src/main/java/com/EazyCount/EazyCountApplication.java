package com.EazyCount;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
@MapperScan("com.EazyCount.dao")
public class EazyCountApplication {

    public static void main(String[] args) {
        SpringApplication.run(EazyCountApplication.class, args);
    }
}
