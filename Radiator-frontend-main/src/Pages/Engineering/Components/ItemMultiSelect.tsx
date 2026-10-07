import { components, type MultiValue, type OptionProps, type StylesConfig } from "react-select";
import Selector from "../../../Components/Selector";

type Opt = { label: string; value: string };

const SELECT_ALL = "__all__";

// Each option is a checkbox row; the menu stays open so several items are ticked in one go.
const CheckOption = (props: OptionProps<Opt, true>) => {
    const checked = props.data.value === SELECT_ALL ? !!props.selectProps.value && (props.selectProps.value as Opt[]).some((v) => v.value === SELECT_ALL) : props.isSelected;
    return (
        <components.Option {...props}>
            <span className={`item-check${props.data.value === SELECT_ALL ? " is-all" : ""}`}>
                <input type="checkbox" className="form-check-input m-0" checked={checked} readOnly tabIndex={-1} aria-hidden="true" />
                <span>{props.label}</span>
            </span>
        </components.Option>
    );
};

// Chips use the brand tint (as in the service-form design); options never get the "selected" fill, the tick shows it.
const styles: StylesConfig<Opt, true> = {
    multiValue: (b, s) => (s.data.value === SELECT_ALL ? { ...b, display: "none" } : { ...b, backgroundColor: "var(--brand-50)" }),
    multiValueLabel: (b) => ({ ...b, color: "var(--brand-text)" }),
    // No chip × in view mode (the picker is disabled there; the bill can't be changed).
    multiValueRemove: (b, s) => (s.isDisabled ? { ...b, display: "none" } : { ...b, color: "var(--brand-text)", ":hover": { backgroundColor: "var(--brand-100)", color: "var(--brand-text)" } }),
    option: (b, s) => ({ ...b, backgroundColor: s.isFocused ? "var(--gray-100)" : "transparent", color: "var(--text-strong)", fontWeight: 400 }),
    valueContainer: (b) => ({ ...b, gap: 6 }),
};

type Props = {
    inputId?: string;
    options: Opt[];
    value: string[];
    onChange: (values: string[]) => void;
    disabled?: boolean;
    placeholder?: string;
    "aria-label"?: string;
};

/** Work / service items picker: checkbox rows with a "Select all" row on top. */
const ItemMultiSelect = ({ inputId, options, value, onChange, disabled, placeholder, ...rest }: Props) => {
    const allSelected = options.length > 0 && options.every((o) => value.includes(o.value));
    const all: Opt = { label: "Select all", value: SELECT_ALL };
    const withAll: Opt[] = options.length > 1 ? [all, ...options] : options;
    const selected = options.filter((o) => value.includes(o.value));

    const handle = (vals: MultiValue<Opt> | null, meta: { option?: Opt; action: string }) => {
        if (meta?.option?.value === SELECT_ALL) {
            onChange(allSelected ? [] : options.map((o) => o.value));
            return;
        }
        onChange((vals || []).filter((v) => v.value !== SELECT_ALL).map((v) => v.value));
    };

    return (
        <Selector<Opt, true>
            isMulti
            inputId={inputId}
            aria-label={rest["aria-label"]}
            isDisabled={disabled}
            options={withAll}
            value={allSelected && withAll[0]?.value === SELECT_ALL ? [...selected, all] : selected}
            onChange={(v, meta) => handle(v, meta as { option?: Opt; action: string })}
            closeMenuOnSelect={false}
            hideSelectedOptions={false}
            components={{ Option: CheckOption }}
            placeholder={placeholder}
            styles={styles}
            noOptionsMessage={() => "No items offered for this BS model"}
        />
    );
};

export default ItemMultiSelect;
