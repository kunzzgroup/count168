package com.eazycount.auth;

import com.eazycount.auth.SessionBootstrapStore.Payload;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import java.io.IOException;
import java.util.Map;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

/**
 * 浏览器端会话桥接（与 PHP login_bootstrap.php 等价，写入 Servlet Session 后跳转 nextRedirect）。
 */
@Controller
public class LoginBootstrapWebController {

  private final SessionBootstrapStore bootstrapStore;

  public LoginBootstrapWebController(SessionBootstrapStore bootstrapStore) {
    this.bootstrapStore = bootstrapStore;
  }

  @GetMapping("/login-bootstrap")
  public void bootstrap(
      @RequestParam("t") String token, HttpServletRequest request, HttpServletResponse response)
      throws IOException {
    Payload payload = bootstrapStore.take(token);
    if (payload == null) {
      response.sendRedirect(request.getContextPath() + "/");
      return;
    }

    HttpSession session = request.getSession(true);
    for (Map.Entry<String, Object> e : payload.sessionAttributes().entrySet()) {
      session.setAttribute(e.getKey(), e.getValue());
    }

    Object rt = session.getAttribute("_bootstrap_remember_token");
    if (rt != null) {
      session.removeAttribute("_bootstrap_remember_token");
      Cookie c = new Cookie("remember_token", String.valueOf(rt));
      c.setPath("/");
      c.setHttpOnly(true);
      c.setMaxAge(30 * 24 * 60 * 60);
      response.addCookie(c);
    }

    String next = payload.nextRedirect();
    if (next.startsWith("http://") || next.startsWith("https://")) {
      response.sendRedirect(next);
    } else {
      String prefix = request.getContextPath();
      if (!next.startsWith("/")) {
        next = "/" + next;
      }
      response.sendRedirect(prefix + next);
    }
  }
}
