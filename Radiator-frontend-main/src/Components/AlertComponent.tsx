// Legacy inline alert slot. Messages raised through useAlertMsg() now render in the global
// <ToastRegion /> (spec §4.17), so this renders nothing. Kept so unmigrated call sites compile.
const AlertComponent = (_props: { alertMessage?: string | null | false; alert?: string; modalAlertSpan?: string }) => null;

export default AlertComponent;
