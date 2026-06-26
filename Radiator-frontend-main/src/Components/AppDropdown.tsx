import { NavLink } from "react-router-dom";

import type { DropdownProps } from "../Types/dropdown";
import Icons from "./Icons";


const AppDropdown = ({ icon, name, data, isActive }: DropdownProps) => {

    return (
        <li className={`nav-item dropdown`}>
            <a className={`nav-link dropdown-toggle${isActive ? " active" : ""}`} href="#/" role="button" data-bs-toggle="dropdown" aria-expanded="false" >
                {icon ? <Icons iconName={icon} className="icon-20 icon-gray me-1" /> : null}{name}
                <span className="caret"></span>
            </a>
            <ul className="dropdown-menu dropdown-menu-end">
                {data?.map((item, index) => (
                    <li key={index}>
                        <NavLink className="dropdown-item menu-link" to={item.navigate} state={{ type: item.type }}>{item.label}</NavLink>
                    </li>))}
            </ul>
        </li>
    );
};

export default AppDropdown;
