import React from "react";
import '../Assets/css/components/switch.css';

interface SwitchProps {
    id?: string;
    className?: string;
    switchClassName?: string;
    defaultChecked?: boolean;
    startText?: string;
    endText?: string;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const Switch: React.FC<SwitchProps> = ({
    id,
    className,
    switchClassName,
    defaultChecked,
    startText,
    endText,
    onChange,
}) => {
    return (
        <label className={className}>
            <input
                type="checkbox"
                id={id}
                defaultChecked={defaultChecked}
                onChange={onChange}
            />
            <div className={"switch-slider switch-" + (switchClassName || "")}>
                <span className="on">{startText}</span>
                <span className="off">{endText}</span>
            </div>
        </label>
    );
};

export default Switch;
