import React from "react";

interface RadioButtonProps {
    id?: string;
    name?: string;
    value?: string | boolean;
    labelText?: string;
    className?: string;
    disabled?: boolean;
    checked?: boolean;
    defaultChecked?: boolean;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const RadioButton: React.FC<RadioButtonProps> = ({
    id,
    name,
    value,
    labelText,
    className,
    disabled,
    checked,
    defaultChecked,
    onChange,
    ...rest
}) => {
    return (
        <div className={`form-check ${className ?? ""}`}>
            <input
                type="radio"
                className="form-check-input"
                id={id}
                name={name}
                value={value as string}
                disabled={disabled}
                checked={checked}
                onChange={onChange}
                defaultChecked={defaultChecked}
                {...rest}
            />
            {labelText && (
                <label className="form-check-label" htmlFor={id}>
                    {labelText}
                </label>
            )}
        </div>
    );
};

export default RadioButton;
