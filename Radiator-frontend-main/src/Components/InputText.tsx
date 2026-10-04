import React from "react";

type InputTextProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "prefix"> & {
    prefix?: string;
    suffix?: string;
    ref?: React.Ref<HTMLInputElement>;
};

/** Text input on the form-control recipe, with an optional ₹ prefix / unit suffix (spec §4.5). */
const InputText = ({ prefix, suffix, className, type, ...rest }: InputTextProps) => {
    const input = (
        <input
            type={type || "text"}
            className={`form-control${className ? ` ${className}` : ""}`}
            onWheel={type === "number" ? (e) => (e.target as HTMLInputElement).blur() : undefined}
            {...rest}
        />
    );
    if (!prefix && !suffix) return input;
    return (
        <div className="input-group">
            {prefix && <span className="input-group-text">{prefix}</span>}
            {input}
            {suffix && <span className="input-group-text">{suffix}</span>}
        </div>
    );
};

export default InputText;
