import Select, { components, type OptionProps, type MultiValue } from "react-select";

type Opt = { label: string; value: string };

const SELECT_ALL = "__all__";

const CheckOption = (props: OptionProps<Opt, true>) => (
    <components.Option {...props}>
        <div className="d-flex align-items-center gap-2">
            <input type="checkbox" checked={props.isSelected} readOnly className="form-check-input m-0" />
            <span>{props.label}</span>
        </div>
    </components.Option>
);

type Props = {
    options: Opt[];
    value: string[];
    onChange: (values: string[]) => void;
    disabled?: boolean;
    placeholder?: string;
};

// Multi-select with checkboxes and a "Select all" row, as in the service-form mockup.
const ItemMultiSelect = ({ options, value, onChange, disabled, placeholder }: Props) => {
    const allSelected = options.length > 0 && options.every((o) => value.includes(o.value));
    const withAll: Opt[] = options.length ? [{ label: "Select all", value: SELECT_ALL }, ...options] : [];
    const selected = options.filter((o) => value.includes(o.value));

    const handle = (vals: MultiValue<Opt>, meta: any) => {
        if (meta?.option?.value === SELECT_ALL) {
            onChange(allSelected ? [] : options.map((o) => o.value));
            return;
        }
        onChange(vals.filter((v) => v.value !== SELECT_ALL).map((v) => v.value));
    };

    return (
        <Select<Opt, true>
            isMulti
            isDisabled={disabled}
            options={withAll}
            value={allSelected ? [...selected, withAll[0]].filter(Boolean) : selected}
            onChange={handle}
            closeMenuOnSelect={false}
            hideSelectedOptions={false}
            components={{ Option: CheckOption }}
            placeholder={placeholder}
            menuPortalTarget={document.body}
            menuPosition="fixed"
            styles={{
                menuPortal: (b) => ({ ...b, zIndex: 999999 }),
                multiValue: (b, s) => (s.data.value === SELECT_ALL ? { ...b, display: "none" } : b),
                control: (b) => ({ ...b, minHeight: 38, fontSize: 14 }),
            }}
        />
    );
};

export default ItemMultiSelect;
