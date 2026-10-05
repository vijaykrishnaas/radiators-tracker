import Select, { components, type OptionProps, type MultiValue, type StylesConfig } from "react-select";
import { selectStyles } from "../../../theme/reactSelectTheme";

type Opt = { label: string; value: string };

const SELECT_ALL = "__all__";

const CheckOption = (props: OptionProps<Opt, true>) => (
    <components.Option {...props}>
        <div className="d-flex align-items-center gap-2">
            <input type="checkbox" checked={props.isSelected} readOnly tabIndex={-1} className="form-check-input m-0" />
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
    /** id of the inner input so a <label htmlFor> can point at it. */
    inputId?: string;
};

const styles: StylesConfig<Opt, true> = {
    ...(selectStyles as unknown as StylesConfig<Opt, true>),
    multiValue: (b, s) => (s.data.value === SELECT_ALL ? { ...b, display: "none" } : (selectStyles.multiValue as any)(b, s)),
};

// Multi-select with checkboxes and a "Select all" row, as in the service-form mockup.
const ItemMultiSelect = ({ options, value, onChange, disabled, placeholder, inputId }: Props) => {
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
            inputId={inputId}
            classNamePrefix="rs"
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
            menuShouldBlockScroll={false}
            styles={styles}
        />
    );
};

export default ItemMultiSelect;
