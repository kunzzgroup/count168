const { useEffect, useMemo, useRef, useState } = React;

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text || "";
    return div.innerHTML;
}

function AlertModal({ open, title, message, onClose }) {
    useEffect(() => {
        if (!open) {
            return undefined;
        }
        const onEscape = (event) => {
            if (event.key === "Escape") {
                onClose();
            }
        };
        document.addEventListener("keydown", onEscape);
        return () => document.removeEventListener("keydown", onEscape);
    }, [open, onClose]);

    return (
        <div
            className={`modal-overlay${open ? " is-open" : ""}`}
            aria-hidden={open ? "false" : "true"}
            onClick={(event) => {
                if (event.target === event.currentTarget) {
                    onClose();
                }
            }}
        >
            <div className="modal-box" role="dialog" aria-labelledby="modalTitle" aria-describedby="modalMessage">
                <div className="modal-icon-wrap">
                    <i className="fas fa-exclamation-triangle modal-icon" aria-hidden="true"></i>
                </div>
                <h3 id="modalTitle" className="modal-title">{title}</h3>
                <p id="modalMessage" className="modal-message">{message}</p>
                <div className="modal-actions">
                    <button type="button" className="modal-btn modal-btn-primary" onClick={onClose}>Confirm</button>
                </div>
            </div>
        </div>
    );
}

function LoginApp() {
    const bootstrap = window.__LOGIN_BOOTSTRAP__ || {};
    const [role, setRole] = useState(bootstrap.defaultRole === "member" ? "member" : "admin");
    const [form, setForm] = useState({
        company_id: "",
        userField: "",
        password: "",
        remember_me: false
    });
    const [maintenanceList, setMaintenanceList] = useState([]);
    const [modal, setModal] = useState({ open: false, title: "Notice", message: "" });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const verifyTimeoutRef = useRef(null);

    useEffect(() => {
        const controller = new AbortController();
        const loadMaintenance = async () => {
            try {
                const response = await fetch("api/maintenance/get_public_api.php", { signal: controller.signal });
                const result = await response.json();
                if (result.success && Array.isArray(result.data)) {
                    setMaintenanceList(result.data);
                } else {
                    setMaintenanceList([]);
                }
            } catch (error) {
                if (error.name !== "AbortError") {
                    setMaintenanceList([]);
                }
            }
        };
        loadMaintenance();
        return () => controller.abort();
    }, []);

    useEffect(() => {
        const companyValue = form.company_id.trim();
        if (verifyTimeoutRef.current) {
            clearTimeout(verifyTimeoutRef.current);
        }
        if (!companyValue) {
            return undefined;
        }

        verifyTimeoutRef.current = setTimeout(async () => {
            try {
                const verifyForm = new FormData();
                verifyForm.append("company_id", companyValue);
                await fetch("api/company/verify_api.php", {
                    method: "POST",
                    body: verifyForm
                });
            } catch (error) {
                // Ignore silent verification errors; login API performs final validation.
            }
        }, 500);

        return () => {
            if (verifyTimeoutRef.current) {
                clearTimeout(verifyTimeoutRef.current);
            }
        };
    }, [form.company_id]);

    const userPlaceholder = useMemo(
        () => (role === "member" ? "Account Id" : "Username"),
        [role]
    );

    const forgotPasswordVisible = role === "admin";

    const showNotice = (message, title = "Notice") => {
        setModal({ open: true, title, message: message || "Unknown error" });
    };

    const submitLogin = async (event) => {
        event.preventDefault();
        if (isSubmitting) {
            return;
        }
        setIsSubmitting(true);
        try {
            const submitForm = new FormData();
            submitForm.append("action", "login");
            submitForm.append("company_id", form.company_id.toUpperCase().trim());
            submitForm.append("password", form.password);
            submitForm.append("login_role", role);
            if (role === "member") {
                submitForm.append("account_id", form.userField.toUpperCase().trim());
            } else {
                submitForm.append("login_id", form.userField.toUpperCase().trim());
                if (form.remember_me) {
                    submitForm.append("remember_me", "1");
                }
            }

            const response = await fetch("login_process.php", {
                method: "POST",
                body: submitForm
            });
            const data = await response.json();
            if (data.status === "success" && data.redirect) {
                window.location.href = data.redirect;
                return;
            }
            showNotice(data.message || "Login failed");
        } catch (error) {
            showNotice("An error occurred during login");
        } finally {
            setIsSubmitting(false);
        }
    };

    const maintenanceVisible = maintenanceList.length > 0;

    return (
        <>
            <div className="login-container">
                {maintenanceVisible && (
                    <div className="maintenance-marquee-wrapper">
                        <div className="maintenance-marquee-track">
                            {[...maintenanceList, ...maintenanceList].map((item, index) => (
                                <div className="maintenance-marquee-item" key={`${item.id}-${index}`}>
                                    <span className="maintenance-marquee-dot"></span>
                                    <span className="maintenance-marquee-label">系统维护中:</span>
                                    <span dangerouslySetInnerHTML={{ __html: escapeHtml(item.content) }}></span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="role-tabs">
                    <button type="button" className={`role-tab${role === "admin" ? " active" : ""}`} onClick={() => setRole("admin")}>Admin</button>
                    <button type="button" className={`role-tab${role === "member" ? " active" : ""}`} onClick={() => setRole("member")}>Member</button>
                </div>

                <div className="login-card">
                    <div className="form-content">
                        <form className="login-form" onSubmit={submitLogin}>
                            <div className="input-group">
                                <i className="fas fa-building input-icon"></i>
                                <input
                                    type="text"
                                    placeholder="Company / Group ID"
                                    required
                                    value={form.company_id}
                                    onChange={(event) => setForm((prev) => ({ ...prev, company_id: event.target.value.toUpperCase() }))}
                                />
                            </div>

                            <div className="input-group">
                                <i className="fas fa-user input-icon"></i>
                                <input
                                    type="text"
                                    placeholder={userPlaceholder}
                                    required
                                    value={form.userField}
                                    onChange={(event) => setForm((prev) => ({ ...prev, userField: event.target.value.toUpperCase() }))}
                                />
                            </div>

                            <div className="input-group">
                                <i className="fas fa-lock input-icon"></i>
                                <input
                                    type="password"
                                    placeholder="Password"
                                    required
                                    value={form.password}
                                    onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                                />
                            </div>

                            <div className="form-options">
                                <label className="remember-switch">
                                    <input
                                        type="checkbox"
                                        checked={form.remember_me}
                                        onChange={(event) => setForm((prev) => ({ ...prev, remember_me: event.target.checked }))}
                                    />
                                    <span className="slider"></span>
                                    <span className="remember-text">Remember me</span>
                                </label>
                                {forgotPasswordVisible && <a href="reset-password.php" className="forgot-link">Forget Password?</a>}
                            </div>

                            <button type="submit" className="login-btn" disabled={isSubmitting}>
                                <span>{isSubmitting ? "Logging in..." : "Login"}</span>
                            </button>
                        </form>
                    </div>
                </div>
            </div>

            <img src="images/telegram.png" alt="Telegram" className="telegram-icon" />

            <AlertModal
                open={modal.open}
                title={modal.title}
                message={modal.message}
                onClose={() => setModal((prev) => ({ ...prev, open: false }))}
            />
        </>
    );
}

ReactDOM.createRoot(document.getElementById("login-root")).render(<LoginApp />);
