import { useState, forwardRef, useImperativeHandle}  from "react";
import Toast from "./Toast";

const ToastContainer = forwardRef((props, ref) => {
    const [toasts, setToasts] = useState([])

    const addToast = (type, message) => {
        const id = Date.now();
        setToasts(prev => [...prev, {id, type, message}])
        setTimeout(() => {
            removeToast(id)
        }, 3000);
    }

    const removeToast = (id) => {
        setToasts(prev => prev.filter((toast) => toast.id !== id))
    }

    useImperativeHandle(ref, () => ({
        addToast,
        removeToast
    }))

    return(
        <div className={`toastContainer ${props.position}`}>
            {toasts.map((toast, index) => (
                <Toast style={{transform: `translateY(${index * 10}%)`}} key={toast.id} type={toast.type} message={toast.message} onClose={() => removeToast(toast.id)}/>
            ))}
        </div>
    );
})

export default ToastContainer;