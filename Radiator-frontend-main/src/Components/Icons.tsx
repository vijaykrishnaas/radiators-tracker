import SpriteSVG from '../Assets/images/sprites.svg';


interface IconsProps {
    iconName: string;
    className?: string;
}

const Icons: React.FC<IconsProps> = ({ iconName, className }) => {
    return (
        <svg className={"icons " + (className || "")}>
            <use xlinkHref={SpriteSVG + "#" + iconName}></use>
        </svg>
    )
}

export default Icons