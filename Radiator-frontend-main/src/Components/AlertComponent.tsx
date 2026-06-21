import React from 'react';
import Alert from './Alert';

interface AlertComponentProps {
    alertMessage?: string | null | false;
    alert: 'success' | 'error' | 'warning' | 'info' | string;
    modalAlertSpan?: string;
}


const AlertComponent: React.FC<AlertComponentProps> = ({ alertMessage, alert, modalAlertSpan }) => {
    return (
        <div>
            {alertMessage && (
                <div>
                    {alert === 'success' && (
                        <Alert
                            alertShow={true}
                            style="success"
                            iconClassName="alert-success-fill"
                            title="Success"
                            message={alertMessage}
                        />
                    )}
                    {alert === 'error' && (
                        <Alert
                            alertShow={true}
                            style="danger"
                            title="Error"
                            message={alertMessage}
                            modalAlertSpan={modalAlertSpan}
                        />
                    )}
                    {alert === 'warning' && (
                        <Alert
                            alertShow={true}
                            style="warning"
                            title="Warning"
                            message={alertMessage}
                        />
                    )}
                    {alert === 'info' && (
                        <Alert
                            alertShow={true}
                            style="info"
                            title="Info"
                            message={alertMessage}
                        />
                    )}
                </div>
            )}
        </div>
    );
};

export default AlertComponent;
