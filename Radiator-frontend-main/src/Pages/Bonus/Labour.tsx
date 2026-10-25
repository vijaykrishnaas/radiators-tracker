import { useSettings } from "../../Context/SettingsContext";
import { monthStart } from "../../Utils/format";
import { workerBonusTitle, workerLabel } from "../../layout/navConfig";
import { BonusPage } from "./Mechanic";

const LabourBonus = () => {
    const { settings } = useSettings();
    return (
        <BonusPage
            type="labour"
            title={workerBonusTitle(settings)}
            nameLabel={workerLabel(settings)}
            namesEndpoint=""
            reviewPath="/bonus/labour/review"
            defaultFrom={monthStart()}
        />
    );
};

export default LabourBonus;
