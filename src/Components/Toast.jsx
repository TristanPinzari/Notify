import { IoIosCheckmarkCircleOutline } from "react-icons/io";
import { VscError } from "react-icons/vsc";
import { MdErrorOutline, MdClose } from "react-icons/md";

const iconTable = {
    success: <IoIosCheckmarkCircleOutline className="toasticon"/>,
    error: <VscError className="toasticon"/>,
    neutral: <MdErrorOutline className="toasticon"/>
}

const Toast = ({ style, type="neutral", message, onClose }) => {
    const icon = iconTable[type] || null;
    return (
        <div className={`toastdiv ${type}`} style={style}>
            {icon}
            <p>{message}</p>
            <MdClose className="toasticon" style={{cursor: "pointer"}} onClick={onClose}/>
        </div>
    );
}

export default Toast