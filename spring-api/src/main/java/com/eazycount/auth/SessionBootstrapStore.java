package com.eazycount.auth;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

@Component
public class SessionBootstrapStore {

  public record Payload(String nextRedirect, Map<String, Object> sessionAttributes) {}

  private static final long TTL_MS = 120_000;

  private static final class Entry {
    final Payload payload;
    final long expiresAtMs;

    Entry(Payload payload, long expiresAtMs) {
      this.payload = payload;
      this.expiresAtMs = expiresAtMs;
    }
  }

  private final ConcurrentHashMap<String, Entry> map = new ConcurrentHashMap<>();

  public String put(Payload payload) {
    purgeExpired();
    String token = UUID.randomUUID().toString().replace("-", "");
    map.put(token, new Entry(payload, Instant.now().toEpochMilli() + TTL_MS));
    return token;
  }

  public Payload take(String token) {
    purgeExpired();
    if (token == null || token.isEmpty()) {
      return null;
    }
    Entry e = map.remove(token);
    if (e == null || Instant.now().toEpochMilli() > e.expiresAtMs) {
      return null;
    }
    return e.payload;
  }

  private void purgeExpired() {
    long now = Instant.now().toEpochMilli();
    map.entrySet().removeIf(en -> now > en.getValue().expiresAtMs);
  }
}
