import { Outlet } from "react-router-dom";
import { useMobileTransaction } from "../../hooks/useMobileTransaction.js";

/**
 * Keeps transaction list state mounted while navigating to Payment History,
 * so Back returns to the same Search results without remounting the hook.
 */
export default function TransactionLayout() {
  const tx = useMobileTransaction();
  return <Outlet context={{ tx }} />;
}
