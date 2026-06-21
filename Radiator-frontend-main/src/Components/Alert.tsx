import React, { useState, useEffect } from "react";
import Icons from './Icons';
import '../Assets/css/components/alerts.css';

interface AlertProps {
    alertShow: boolean;
    style: string;
    iconClassName?: string;
    title?: string;
    message?: string;
    modalAlertSpan?: string;
    buttonShow?: boolean;
    color?: string;
    onClick?: () => void;
    downIcon?: string;
    downloadButtonText?: string;
    alertClose?: boolean;
    className?: string;
}

const Alert: React.FC<AlertProps> = (props) => {
    const [alert, setAlert] = useState(true);

    useEffect(() => {
        getIconType(props.style);
    }, [props.style]);

    const getIconType = (iconType: string): string => {
        switch (iconType) {
            case "success":
            case "success-light":
                return "success";
            case "warning":
            case "warning-light":
                return "warningmessage";
            case "danger":
            case "danger-light":
                return "errormessage";
            case "primary":
            case "primary-light":
                return "hintmessage";
            case "alert-ab-light-success":
                return "thankyou";
            case "alert-ab-light-warning":
                return "warning2radius";
            case "alert-ab-light-danger":
                return "warningnew";
            case "alert-ab-light-info":
                return "thankyou";
            case "alert-ab-success":
                return "success";
            case "alert-ab-warning":
                return "warningtriangle";
            case "alert-ab-danger":
                return "warningtriangle";
            case "alert-ab-info":
                return "infocircle2";
            default:
                return " ";
        }
    };

    const closeAlert = () => {
        setAlert(false);
    };

    return (
        <div>
            {props.alertShow && alert && (
                <div
                    className={`alert d-flex alert-${props.style} ${props.className || ""}`}
                    role="alert"
                >
                    <div className="me-2">
                        <Icons iconName={getIconType(props.style)} className={props.iconClassName || ""} />
                    </div>
                    <div>
                        {props.title && <p className="alert-header">{props.title}</p>}
                        <p className={props.modalAlertSpan || "alert-description"}>
                            <span dangerouslySetInnerHTML={{ __html: props.message || "" }} />
                        </p>

                        {props.buttonShow && (
                            <button className={`mt-3 btn btn-${props.color}`} onClick={props.onClick}>
                                <Icons iconName={props.downIcon || ""} /> {props.downloadButtonText}
                            </button>
                        )}

                        {props.alertClose && (
                            <button
                                type="button"
                                className="btn-close"
                                data-bs-dismiss="alert"
                                aria-label="Close"
                                onClick={closeAlert}
                            ></button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default Alert;
