interface CheckBoxProps {
    className?: string;
    defaultChecked?: boolean;
    onChange?: React.ChangeEventHandler<HTMLInputElement>;
    checked?: boolean;
    name?: string;
    id?: string;
    value?: string | number | readonly string[];
    disabled?: boolean;
    labelText?: React.ReactNode;
}

const CheckBox = (props: CheckBoxProps) => {

    return (
        <div className={"form-check " + (props.className ?? "")}>
            <input className="form-check-input" type="checkbox" defaultChecked={props.defaultChecked} onChange={props.onChange} checked={props.checked} name={props.name} id={props.id} value={props.value} disabled={props.disabled} />
            <label className="form-check-label" htmlFor={props.id}>{props.labelText} </label>
        </div>
    )
}

export default CheckBox;