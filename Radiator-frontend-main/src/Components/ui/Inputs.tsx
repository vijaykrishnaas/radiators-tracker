import React, { useRef, useState } from "react";
import Icons from "../../Components/Icons";
import { Popover, MenuItems } from "./Menu";

/* ---------------- Switch (Bootstrap .form-switch, §4.5) ---------------- */
export function Switch({ id, label, checked, onChange, disabled }: {
    id: string; label: React.ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
    return (
        <div className="form-check form-switch d-flex align-items-center gap-2 mb-0" style={{ minHeight: 44 }}>
            <input className="form-check-input mt-0" type="checkbox" role="switch" id={id} checked={checked} disabled={disabled}
                onChange={(e) => onChange(e.target.checked)} />
            <label className="form-check-label" htmlFor={id}>{label}</label>
        </div>
    );
}

/* ---------------- Money / number input with prefix or suffix ---------------- */
export function AffixInput({ id, prefix, suffix, className = "", invalid, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & {
    id?: string; prefix?: string; suffix?: string; invalid?: boolean;
}) {
    return (
        <div className="input-group">
            {prefix && <span className="input-group-text">{prefix}</span>}
            <input
                id={id}
                className={`form-control${invalid ? " is-invalid" : ""} ${className}`}
                aria-invalid={invalid || undefined}
                onWheel={rest.type === "number" ? (e) => (e.target as HTMLInputElement).blur() : undefined}
                {...rest}
            />
            {suffix && <span className="input-group-text">{suffix}</span>}
        </div>
    );
}

/* ---------------- Password with eye toggle (§4.5) ---------------- */
export function PasswordInput({ id, value, onChange, placeholder, invalid, autoComplete, describedBy }: {
    id: string; value: string; onChange: (v: string) => void; placeholder?: string; invalid?: boolean; autoComplete?: string; describedBy?: string;
}) {
    const [show, setShow] = useState(false);
    return (
        <div className="input-icon">
            <input id={id} type={show ? "text" : "password"} className="form-control has-right" value={value}
                placeholder={placeholder} autoComplete={autoComplete} aria-invalid={invalid || undefined} aria-describedby={describedBy}
                onChange={(e) => onChange(e.target.value)} />
            <button type="button" className="btn btn-icon" aria-label="Show password" aria-pressed={show} onClick={() => setShow((s) => !s)}>
                <Icons iconName={show ? "eye-off" : "view"} />
            </button>
        </div>
    );
}

/* ---------------- Chip input (§4.18): add with Enter, × remove, drag or menu to reorder ---------------- */
export function ChipInput({ id, values, onChange, placeholder = "Type and press Enter", label }: {
    id: string; values: string[]; onChange: (next: string[]) => void; placeholder?: string; label: string;
}) {
    const [text, setText] = useState("");
    const drag = useRef<number | null>(null);
    const [over, setOver] = useState<number | null>(null);
    const add = () => {
        const v = text.trim();
        if (!v || values.includes(v)) { setText(""); return; }
        onChange([...values, v]);
        setText("");
    };
    const move = (from: number, to: number) => {
        if (to < 0 || to >= values.length || from === to) return;
        const next = [...values];
        const [x] = next.splice(from, 1);
        next.splice(to, 0, x);
        onChange(next);
    };
    return (
        <div>
            {values.length > 0 && (
                <ul className="chip-list" aria-label={label}>
                    {values.map((v, i) => (
                        <li
                            key={v}
                            className={`chip${drag.current === i ? " is-dragging" : ""}${over === i ? " is-drop" : ""}`}
                            draggable
                            onDragStart={(e) => { drag.current = i; e.dataTransfer.effectAllowed = "move"; }}
                            onDragOver={(e) => { e.preventDefault(); setOver(i); }}
                            onDragLeave={() => setOver(null)}
                            onDrop={(e) => { e.preventDefault(); if (drag.current !== null) move(drag.current, i); drag.current = null; setOver(null); }}
                            onDragEnd={() => { drag.current = null; setOver(null); }}
                        >
                            <span className="chip-handle" aria-hidden="true"><Icons iconName="grip" /></span>
                            <Popover
                                role="menu"
                                align="start"
                                trigger={(p) => <button type="button" className="chip-label" aria-label={`${v}: options`} {...p}>{v}</button>}
                            >
                                {(close) => (
                                    <MenuItems close={close} items={[
                                        { label: "Move up", icon: "chevron-left", disabled: i === 0, onClick: () => move(i, i - 1) },
                                        { label: "Move down", icon: "chevron-right", disabled: i === values.length - 1, onClick: () => move(i, i + 1) },
                                        { divider: true },
                                        { label: "Remove", icon: "delete", danger: true, onClick: () => onChange(values.filter((x) => x !== v)) },
                                    ]} />
                                )}
                            </Popover>
                            <button type="button" className="chip-x" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))}>
                                <Icons iconName="x" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            <input
                id={id}
                className="form-control"
                value={text}
                placeholder={placeholder}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } }}
                onBlur={() => { if (text.trim()) add(); }}
            />
        </div>
    );
}

/* ---------------- Upload with preview (§4.18) ---------------- */
export function Upload({ id, label, hint, accept, previewUrl, uploading, onFile, onRemove, cover = false, emptyText }: {
    id: string;
    label: string;
    hint: string;
    accept: string;
    previewUrl?: string;
    uploading?: boolean;
    onFile: (f: File | undefined) => void;
    onRemove?: () => void;
    cover?: boolean;
    emptyText?: string;
}) {
    const [isOver, setOver] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    return (
        <div className="field">
            <span className="form-label d-block" id={`${id}-label`}>{label}</span>
            <div className="upload">
                <label
                    className={`upload-zone${isOver ? " is-over" : ""}${uploading ? " is-disabled" : ""}`}
                    htmlFor={id}
                    onDragOver={(e) => { e.preventDefault(); setOver(true); }}
                    onDragLeave={() => setOver(false)}
                    onDrop={(e) => { e.preventDefault(); setOver(false); if (!uploading) onFile(e.dataTransfer.files?.[0]); }}
                >
                    <Icons iconName="upload" />
                    <span>{uploading ? "Uploading…" : <>Drop image or <span className="t-brand t-medium">browse</span></>}</span>
                    <span className="t-xs">{hint}</span>
                    <input ref={inputRef} id={id} type="file" accept={accept} disabled={uploading} aria-labelledby={`${id}-label`}
                        onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
                </label>
                {previewUrl ? (
                    <div className="d-flex flex-column align-items-center gap-1">
                        <div className={`upload-preview${cover ? " is-cover" : ""}`}>
                            <img src={previewUrl} alt={`${label} preview`} />
                            {onRemove && (
                                <button type="button" className="btn btn-icon" aria-label={`Remove ${label.toLowerCase()}`} onClick={onRemove}>
                                    <Icons iconName="x" />
                                </button>
                            )}
                        </div>
                        <button type="button" className="btn btn-link btn-sm p-0" style={{ minHeight: 32 }} onClick={() => inputRef.current?.click()}>Replace</button>
                    </div>
                ) : (
                    emptyText && <span className="t-sm t-muted">{emptyText}</span>
                )}
            </div>
        </div>
    );
}
