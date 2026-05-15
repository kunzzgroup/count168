import React, { useEffect, useLayoutEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import ProcessListPage from "./ProcessListPage.jsx";
import BankProcessListPage from "../bankprocesslist/BankProcessListPage.jsx";
import "../../../public/css/processWorkspace.css";

function isBankProcessPath(pathname) {
  return pathname === "/bank-process-list" || pathname.startsWith("/bank-process-list/");
}

export default function ProcessWorkspacePage() {
  const location = useLocation();
  const viewMode = isBankProcessPath(location.pathname) ? "bank" : "games";
  const [gamesMounted, setGamesMounted] = useState(viewMode === "games");
  const [bankMounted, setBankMounted] = useState(viewMode === "bank");

  useEffect(() => {
    if (viewMode === "games") setGamesMounted(true);
    if (viewMode === "bank") setBankMounted(true);
  }, [viewMode]);

  useLayoutEffect(() => {
    document.body.classList.remove("bg", "dashboard-page", "account-page", "announcement-page");
    document.body.classList.add("process-page");
    if (viewMode === "bank") document.body.classList.add("process-page--bank");
    else document.body.classList.remove("process-page--bank");
    return () => {
      document.body.classList.remove("process-page", "process-page--bank", "process-page--bank-show-all");
    };
  }, [viewMode]);

  return (
    <div className="process-workspace">
      {gamesMounted ? (
        <div
          className={`process-workspace__pane${viewMode === "games" ? " is-active" : ""}`}
          aria-hidden={viewMode !== "games"}
        >
          <ProcessListPage workspaceHost isWorkspaceActive={viewMode === "games"} />
        </div>
      ) : null}
      {bankMounted ? (
        <div
          className={`process-workspace__pane${viewMode === "bank" ? " is-active" : ""}`}
          aria-hidden={viewMode !== "bank"}
        >
          <BankProcessListPage workspaceHost isWorkspaceActive={viewMode === "bank"} />
        </div>
      ) : null}
    </div>
  );
}
