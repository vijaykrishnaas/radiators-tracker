import { useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import Icons from "../Components/Icons";
import { getUser, clearSession } from "../Services/Auth";

const AdminHeader = () => {
    const navigate = useNavigate();
    const user = getUser();

    // The admin portal has no client settings to drive the tab title.
    useEffect(() => { document.title = "Super Admin Console"; }, []);

    const handleLogout = () => {
        clearSession();
        navigate("/admin/login");
    };

    return (
        <header className="header">
            <nav className="navbar navbar-expand-lg bg-header fixed-top" id="header">
                <div className="container-fluid">
                    <div className="navbar-brand admin-brand">
                        <span className="admin-brand-mark">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" />
                                <path d="M9 12l2 2 4-4" />
                            </svg>
                        </span>
                        <span>
                            <span className="admin-brand-name d-block">Super Admin</span>
                            <span className="admin-brand-tag">Console</span>
                        </span>
                    </div>
                    <div className="d-flex align-items-center">
                        <ul className="navbar-nav navbar-nav-header flex-row mb-0">
                            <li className="nav-item">
                                <NavLink className="nav-link px-3" to="/admin/clients">
                                    <Icons iconName="data_management" className="icon-18 icon-gray me-1" />
                                    Clients
                                </NavLink>
                            </li>
                            <li className="nav-item">
                                <NavLink className="nav-link px-3" to="/admin/audit">
                                    <Icons iconName="data_management" className="icon-18 icon-gray me-1" />
                                    Audit
                                </NavLink>
                            </li>
                        </ul>
                        <div className="header-user-sec">
                            <ul className="nav navbar-nav ps-3">
                                <li className="nav-item dropdown user-dropdown d-flex align-items-center">
                                    <a className="nav-link dropdown-toggle d-flex" href="#/" role="button" data-bs-toggle="dropdown" aria-expanded="false">
                                        <div className="user-name-sec mt-1">
                                            <span>{user?.name || user?.userId || "Admin"}</span>
                                            <span className="caret"></span>
                                        </div>
                                    </a>
                                    <ul className="dropdown-menu dropdown-menu-end">
                                        <li>
                                            <NavLink className="dropdown-item menu-link" to="/change-password">
                                                <Icons iconName="data_management" className="me-1 icon-18" />Change Password
                                            </NavLink>
                                        </li>
                                        <li className="logout">
                                            <button type="button" className="dropdown-item menu-link" onClick={handleLogout}>
                                                <Icons iconName="logout_user" className="me-1 icon-18 remove-icon" />Logout
                                            </button>
                                        </li>
                                    </ul>
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
            </nav>
        </header>
    );
};

export default AdminHeader;
