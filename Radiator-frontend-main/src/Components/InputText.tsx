import React from "react";

interface InputTextProps {
    type?: string;
    value?: string | number | undefined;
    id?: string;
    name?: string;
    className?: string;
    placeholder?: string;
    onChange?: React.ChangeEventHandler<HTMLInputElement>;
    onBlur?: React.FocusEventHandler<HTMLInputElement>;
    disabled?: boolean;
    readOnly?: boolean;
    prefix?: string;
    suffix?: string;
    max?: string;
}


const InputText = (props: InputTextProps) => {


    return (
        <div className="input-group">
            {props.prefix && <span className="input-group-text">{props.prefix}</span>}
            <input
                type={props.type || "text"}
                value={props.value}
                id={props.id}
                name={props.name}
                className={'form-control ' + props.className}
                placeholder={props.placeholder}
                onChange={props.onChange}
                onBlur={props.onBlur}
                onWheel={props.type == 'number' ? (e) => (e.target as HTMLInputElement).blur() : undefined}
                disabled={props.disabled}
                readOnly={props.readOnly}
                max={props.max}
            />
            {props.suffix && <span className="input-group-text">{props.suffix}</span>}
        </div>
    );
};

export default InputText;