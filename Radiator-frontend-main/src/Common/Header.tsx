
import { useEffect, useRef } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';

import { Bonus } from '../Constants/HeaderData';
import Icons from '../Components/Icons';
import AppDropdown from '../Components/AppDropdown';
import { getUser, clearSession } from '../Services/Auth';
import { useSettings } from '../Context/SettingsContext';


const Header = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { settings } = useSettings();
    const user = getUser();

    // Bill create/edit/view live under /issueCounter/dashboard/* — keep "Bills" lit there.
    const navClass = (active: boolean) => `nav-link${active ? ' active' : ''}`;
    const onDashboardSub = location.pathname.startsWith('/issueCounter/dashboard/');

    const handleLogout = () => {
        clearSession();
        navigate('/issueCounter/login');
    };

    const navbarCollapseRef = useRef<HTMLDivElement>(null);
    const handleNavLinkClick = () => {
        if (
            window.innerWidth < 992 &&
            navbarCollapseRef.current &&
            navbarCollapseRef.current.classList.contains('show')
        ) {
            navbarCollapseRef.current.classList.remove('show');
        }
    };
    useEffect(() => {
        const link = document.querySelectorAll('.navbar .menu-link');
        link.forEach(e => {
            e.addEventListener('click', () => {
                handleNavLinkClick();
            });
        });
    }, []);

    return (

        <header className="header">
            <nav className="navbar navbar-expand-lg bg-header fixed-top" id="header">
                <div className="container-fluid">
                    <a className="navbar-brand font-s16 font-w600 d-flex align-items-center gap-2" href="/issueCounter/dashboard" style={{ color: 'var(--titleColor)' }}>
                        {settings.company.logoUrl && (
                            <img
                                src={settings.company.logoUrl.startsWith('/') ? `${import.meta.env.VITE_BACKEND_BASE_URL || 'http://localhost:5000'}${settings.company.logoUrl}` : settings.company.logoUrl}
                                alt="Logo" style={{ height: 28, maxWidth: 120, objectFit: 'contain' }}
                            />
                        )}
                        {settings.company.name || ''}
                    </a>
                    <div className='d-flex align-items-center'>
                        <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarSupportedContent"
                            aria-controls="navbarSupportedContent" aria-expanded="false" aria-label="Toggle navigation">
                            <span className="navbar-toggler-icon"></span>
                        </button>
                        <div className="collapse navbar-collapse" id="navbarSupportedContent" ref={navbarCollapseRef}>
                            <a className="mobile-menu-close" data-bs-toggle="collapse" data-bs-target="#navbarSupportedContent">
                                <Icons iconName="modelclose" className="icon-menu-close" />
                            </a>
                            <ul className="navbar-nav navbar-nav-header mb-2 mb-lg-0">
                                <li className="nav-item">
                                    <NavLink end to="/issueCounter/dashboard" onClick={handleNavLinkClick}
                                        className={({ isActive }) => navClass(isActive)}>
                                        Dashboard
                                    </NavLink>
                                </li>
                                <li className="nav-item">
                                    <NavLink to="/issueCounter/billing" onClick={handleNavLinkClick}
                                        className={({ isActive }) => navClass(isActive || onDashboardSub)}>
                                        Bills
                                    </NavLink>
                                </li>
                                <li className="nav-item">
                                    <NavLink to="/issueCounter/expenses" onClick={handleNavLinkClick}
                                        className={({ isActive }) => navClass(isActive)}>
                                        Expenses
                                    </NavLink>
                                </li>
                                <AppDropdown name="Bonus" data={Bonus} />
                            </ul>
                        </div>
                        <div className="header-user-sec ">
                            <ul className="nav navbar-nav ps-3">
                                <li className="nav-item dropdown user-dropdown d-flex align-items-center">
                                    <a className="nav-link dropdown-toggle d-flex" href="#/" role="button" data-bs-toggle="dropdown" aria-expanded="false">
                                        <div className="user-name-sec mt-1">
                                            <span>{user?.name || user?.userId || 'User'}</span>
                                            <span className="caret"></span>
                                        </div>
                                    </a>
                                    <ul className="dropdown-menu dropdown-menu-end">
                                        <li>
                                            <NavLink className="dropdown-item menu-link" to={'/settings'}>
                                                <Icons iconName="settings" className="me-1 icon-18" />{'Settings'}
                                            </NavLink>
                                        </li>
                                        <li>
                                            <NavLink className="dropdown-item menu-link" to={'/audit'}>
                                                <Icons iconName="history" className="me-1 icon-18" />{'Activity Log'}
                                            </NavLink>
                                        </li>
                                        <li>
                                            <NavLink className="dropdown-item menu-link" to={'/change-password'}>
                                                <Icons iconName="key" className="me-1 icon-18" />{'Change Password'}
                                            </NavLink>
                                        </li>
                                        <li className="logout">
                                            <button type="button" className="dropdown-item menu-link" onClick={handleLogout}>
                                                <Icons iconName="logout_user" className="me-1 icon-18 remove-icon" />{'Logout'}
                                            </button>
                                        </li>
                                    </ul>
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
            </nav>
        </header >
    )

}

export default Header
