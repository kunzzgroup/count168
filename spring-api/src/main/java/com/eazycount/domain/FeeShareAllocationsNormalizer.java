package com.eazycount.domain;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 对齐 api/domain/domain_api.php 中 normalizeFeeShareAllocationsInput 的输出结构。
 */
public final class FeeShareAllocationsNormalizer {

  private static final ObjectMapper MAPPER = new ObjectMapper();

  private FeeShareAllocationsNormalizer() {}

  public static Map<String, Object> normalize(Object raw) {
    Map<String, Object> out = new HashMap<>();
    out.put("sales", new ArrayList<Map<String, Object>>());
    out.put("cs", new ArrayList<Map<String, Object>>());
    out.put("it", new ArrayList<Map<String, Object>>());
    if (raw == null) {
      return out;
    }
    JsonNode node;
    try {
      if (raw instanceof String s) {
        if (s.isBlank()) {
          return out;
        }
        node = MAPPER.readTree(s);
      } else {
        node = MAPPER.valueToTree(raw);
      }
    } catch (Exception e) {
      return out;
    }
    if (node == null || !node.isObject()) {
      return out;
    }
    for (String role : List.of("sales", "cs", "it")) {
      @SuppressWarnings("unchecked")
      List<Map<String, Object>> target = (List<Map<String, Object>>) out.get(role);
      JsonNode arr = node.get(role);
      if (arr == null || !arr.isArray()) {
        continue;
      }
      for (JsonNode row : arr) {
        if (row == null || !row.isObject()) {
          continue;
        }
        int aid = row.path("account_id").asInt(0);
        double pct = row.path("percentage").asDouble(0.0);
        if (aid != 0 && pct >= 0) {
          Map<String, Object> entry = new HashMap<>();
          entry.put("account_id", aid);
          entry.put("percentage", Math.round(pct * 10000.0) / 10000.0);
          target.add(entry);
        }
      }
    }
    return out;
  }
}
