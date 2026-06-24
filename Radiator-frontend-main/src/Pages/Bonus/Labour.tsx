import { useSettings } from "../../Context/SettingsContext";
import { monthStart } from "../../Utils/format";
import { BonusPage } from "./Mechanic";

const LabourBonus = () => {
    const { settings } = useSettings();
    return (
        <BonusPage
            type="labour"
            title={`${settings.labels.worker.replace(/\s*Name$/i, "")} Bonus`}
            nameLabel={settings.labels.worker}
            namesEndpoint=""
            reviewPath="/bonus/labour/review"
            defaultFrom={monthStart()}
        />
    );
};

export default LabourBonus;
