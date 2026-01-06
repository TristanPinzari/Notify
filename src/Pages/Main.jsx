import { auth, db, GetUserData, signOutUser } from "../../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { storage, bucketId } from "../../appwrite";
import { generateCompiledDoc } from "../../compiler";
import {
  getDoc,
  updateDoc,
  doc,
  arrayUnion,
  arrayRemove,
  onSnapshot,
  deleteField,
  writeBatch,
} from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";

import { GoPlus } from "react-icons/go";
import { MdDeleteForever } from "react-icons/md";
import { PiSignOut } from "react-icons/pi";

import ToastContainer from "../Components/ToastContainer";
import { ID } from "appwrite";

function Home() {
  const navigate = useNavigate();

  const toastRef = useRef(null);

  const [userData, setUserData] = useState(null);

  const [joinOrCreate, setJoinOrCreate] = useState("join");
  const [visibleOverlay, setVisibleOverlay] = useState("none");
  const [classes, setClasses] = useState([]);
  const [currentClass, setCurrentClass] = useState({});
  const [currentTopic, setCurrentTopic] = useState({});
  const [currentTab, setCurrentTab] = useState("Pinned Doc");
  const [classOverlayValue, setClassOverlayValue] = useState("");
  const [topicOverlayValue, setTopicOverlayValue] = useState("");
  const [classMembers, setClassMembers] = useState({});
  const [grammarCheck, setGrammarCheck] = useState(true);
  const [bulletFormat, setBulletFormat] = useState("");
  const [compiledDocData, setCompiledDocData] = useState({});
  const [isCompiling, setIsCompiling] = useState(false);

  useEffect(() => {
    //Keeps track of whether the user is still logged in or not
    let isMounted = true;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!isMounted) return;
      if (user) {
        const data = await GetUserData();
        if (!data) {
          navigate("/login");
          return;
        }
        setUserData(data); //Initializes userData so firestore gets uid it requires to make its own observer
      } else {
        setUserData(null);
        navigate("/login");
        return;
      }
    });
    return () => {
      isMounted = false;
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    //Keeps userData in sync with firestore, regardless of whichever user is logged in
    if (!userData) return;
    const userRef = doc(db, "users", userData.uid);
    const unsubscribe = onSnapshot(userRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setUserData(data);
        setClasses(data.classes);
      }
    });
    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userData?.uid]);

  useEffect(() => {
    //Keeps the currently opened class in sync with firestore
    if (!currentClass?.classCode) return;
    const classRef = doc(db, "classes", currentClass.classCode);
    const unsubscribe = onSnapshot(classRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setCurrentClass(data);
      }
    });
    return () => unsubscribe();
  }, [currentClass?.classCode]);

  useEffect(() => {
    //Keeps currentTopic in sync
    if (currentTopic?.topicName && currentClass?.topics) {
      if (currentTopic?.topicName in currentClass.topics) {
        setCurrentTopic(currentClass.topics[currentTopic.topicName]);
        return;
      }
    }
    AutoSelectTopic();
    //Keep classMembers updated with members' data
    fillClassMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentClass]);

  useEffect(() => {
    //Makes sure the user is not able to see a class they are not in. Also, autoselect if necessary
    if (classes && classes.length > 0) {
      if (classes.some((cls) => cls.classCode == currentClass?.classCode))
        return;
      SelectClass(classes[0].className, classes[0].classCode);
    } else {
      setCurrentClass({});
      setCurrentTopic({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classes]);

  useEffect(() => {
    //Auto select topic upon selecting a new class, if possible
    AutoSelectTopic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentClass?.classCode]);

  function AutoSelectTopic() {
    if (currentClass && currentClass.topics) {
      const keys = Object.keys(currentClass.topics);
      if (keys.length > 0) {
        setCurrentTopic(currentClass.topics[keys[0]]);
        return;
      }
    }
    setCurrentTopic({});
  }

  async function fillClassMembers() {
    if (!currentClass?.members) {
      setClassMembers([]);
      return;
    }
    const membersData = await Promise.all(
      currentClass.members.map(async (uid) => {
        const snap = await getDoc(doc(db, "users", uid));
        return snap.exists() ? snap.data() : null;
      })
    );
    setClassMembers(membersData.filter(Boolean));
  }

  const chars = "QWERTYUIOPASDFGHJKLZXCVBNM1234567890";
  const codeLength = 6;
  async function GenerateNewClassCode() {
    let code;
    let exists;
    do {
      code = "";
      for (let i = 0; i < codeLength; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
      }
      const docSnap = await getDoc(doc(db, "classes", code));
      exists = docSnap.exists();
    } while (exists);
    return code;
  }

  async function RemoveClassFromUser(className, classCode) {
    return updateDoc(doc(db, "users", userData.uid), {
      classes: arrayRemove({ className: className, classCode: classCode }),
    });
  }

  async function CreateNewClass() {
    try {
      const newClassCode = await GenerateNewClassCode();
      const newClassName = classOverlayValue;
      const newClassRef = doc(db, "classes", newClassCode);
      const userRef = doc(db, "users", userData.uid);
      const batch = writeBatch(db);
      batch.set(newClassRef, {
        className: newClassName,
        classCode: newClassCode,
        members: [userData.uid],
      });
      batch.update(userRef, {
        classes: arrayUnion({
          className: newClassName,
          classCode: newClassCode,
        }),
      });
      await batch.commit();
      toastRef.current.addToast("success", "Class created successfully.");
      setVisibleOverlay("none");
      SelectClass(newClassName, newClassCode);
    } catch (error) {
      console.error("Caught error when creating new class:", error);
      toastRef.current.addToast("error", "Class created unsuccessfully.");
    }
  }

  async function JoinNewClass() {
    const classCode = classOverlayValue;
    if (!classCode) return;
    const newClassRef = doc(db, "classes", classCode);
    const newClassSnap = await getDoc(newClassRef);
    if (!newClassSnap.exists()) {
      console.error("Failed joining class | Class does not exist:", classCode);
      toastRef.current.addToast("error", "Class does not exist.");
    } else {
      const classData = newClassSnap.data();
      try {
        const userRef = doc(db, "users", userData.uid);
        const batch = writeBatch(db);
        batch.update(newClassRef, {
          members: arrayUnion(userData.uid),
        });
        batch.update(userRef, {
          classes: arrayUnion({
            className: classData.className,
            classCode: classCode,
          }),
        });
        await batch.commit();
        toastRef.current.addToast("success", "Successfully joined class.");
        setVisibleOverlay("none");
      } catch (error) {
        console.error(
          "Caught error when adding user to class or when updating user's classes list:",
          error
        );
      }
    }
  }

  async function SelectClass(className, classCode) {
    const classSnap = await getDoc(doc(db, "classes", classCode));
    if (!classSnap.exists()) {
      toastRef.current.addToast("error", "Class no longer exists.");
      await RemoveClassFromUser(className, classCode);
      return;
    }
    const classData = classSnap.data();
    if (!classData.members.includes(userData.uid)) {
      toastRef.current.addToast(
        "error",
        "You are no longer a member of this class."
      );
      await RemoveClassFromUser(classData.className, classData.classCode);
      return;
    }
    setCurrentClass(classData);
  }

  async function CreateNewTopic() {
    if (!currentClass) return;
    const newTopicName = topicOverlayValue;
    if (currentClass.topics?.newTopicName) {
      toastRef.current.addToast(
        "error",
        "A topic with this name already exists."
      );
      return;
    }
    try {
      const newObject = { topicName: newTopicName };
      await updateDoc(doc(db, "classes", currentClass.classCode), {
        [`topics.${newTopicName}`]: newObject,
      });
      toastRef.current.addToast("success", "Topic created successfully.");
      setVisibleOverlay("none");
      setCurrentTopic(newObject);
    } catch (error) {
      console.error("Caught error while trying to create new topic:", error);
      return;
    }
  }

  async function uploadPinnedDoc(e) {
    if (!currentClass || !currentTopic?.topicName || !userData) return;
    const file = e.target.files[0];
    e.target.value = null;
    if (!file) {
      toastRef.current.addToast("error", "File does not exist.");
      return;
    }
    if (file.type !== "application/pdf") {
      toastRef.current.addToast("error", "You can only upload a single PDF.");
      return;
    }
    try {
      const fileId = ID.unique();
      await storage.createFile({
        bucketId: bucketId,
        fileId: fileId,
        file: file,
      });
      const fileUrl = storage.getFileDownload({
        bucketId: bucketId,
        fileId: fileId,
      });
      const oldPinnedId = currentTopic?.pinnedDoc?.fileId;
      await updateDoc(doc(db, "classes", currentClass.classCode), {
        [`topics.${currentTopic.topicName}.pinnedDoc`]: {
          pinnedBy: userData.username,
          pinnedDate: Date.now(),
          fileId: fileId,
          fileUrl: fileUrl,
          fleName: file.name,
        },
      });
      toastRef.current.addToast("success", "Successfully pinned file.");
      if (oldPinnedId) deleteFileFromStorage(oldPinnedId);
    } catch (error) {
      console.error("Caught error while pinning uploaded file:", error);
      toastRef.current.addToast(
        "error",
        "Something went wrong while uploading file."
      );
      return;
    }
  }

  async function pinCompiled() {
    if (!currentClass || !currentTopic?.topicName || !userData) return;
    try {
      const innerHTML =
        compiledDocData[currentClass?.className]?.[currentTopic?.topicName] ||
        "";
      if (innerHTML == "")
        throw new Error("No compiled document to be pinned.");
      const oldPinnedId = currentTopic?.pinnedDoc?.fileId;
      await updateDoc(doc(db, "classes", currentClass.classCode), {
        [`topics.${currentTopic.topicName}.pinnedDoc`]: {
          pinnedBy: userData.username,
          pinnedDate: Date.now(),
          innerHTML: innerHTML,
        },
      });
      toastRef.current.addToast(
        "success",
        "Successfully pinned compiled document."
      );
      if (oldPinnedId) deleteFileFromStorage(oldPinnedId);
    } catch (error) {
      console.error("Caught error while pinning uploaded file:", error);
      toastRef.current.addToast("error", error);
      return;
    }
  }

  async function isUrlValid(url) {
    try {
      const result = await fetch(url, { method: "HEAD" });
      return result.ok;
    } catch (e) {
      console.error("Invalid url:", e);
      return false;
    }
  }

  async function isPinnedUrlValid(url) {
    const valid = await isUrlValid(url);
    if (!valid) {
      updateDoc(doc(db, "classes", currentClass.classCode), {
        [`topics.${currentTopic.topicName}.pinnedDoc`]: {},
      });
    }
    return valid;
  }

  async function isCollectionUrlValid(doc) {
    const valid = await isUrlValid(doc.fileUrl);
    if (!valid) {
      deleteFileFromCollection(doc);
    }
    return valid;
  }

  async function uploadToCollection(e) {
    for (const file of e.target.files) {
      try {
        const fileId = ID.unique();
        await storage.createFile({
          bucketId: bucketId,
          fileId: fileId,
          file: file,
        });
        const fileUrl = storage.getFileDownload({
          bucketId: bucketId,
          fileId: fileId,
        });
        await updateDoc(doc(db, "classes", currentClass.classCode), {
          [`topics.${currentTopic.topicName}.collection.${fileId}`]: {
            uploadedBy: userData.username,
            uploadedDate: Date.now(),
            fileId: fileId,
            fileUrl: fileUrl,
            fileName: file.name,
            noCompile: false,
          },
        });
        toastRef.current.addToast(
          "success",
          "Successfully added file to collection."
        );
      } catch (error) {
        console.error("Caught error while pinning uploaded file:", error);
        toastRef.current.addToast(
          "error",
          "Something went wrong while uploading file."
        );
        return;
      }
    }
    e.target.value = null;
  }

  async function deleteFileFromStorage(file_id) {
    try {
      await storage.deleteFile({
        bucketId: bucketId,
        fileId: file_id,
      });
      toastRef.current.addToast("success", "File deleted from storage.");
    } catch (e) {
      console.error("Caught error while deleting file from storage:", e);
    }
  }

  function deleteFileFromCollection(document) {
    try {
      updateDoc(doc(db, "classes", currentClass.classCode), {
        [`topics.${currentTopic.topicName}.collection.${document.fileId}`]:
          deleteField(),
      });
      deleteFileFromStorage(document.fileId);
      toastRef.current.addToast("success", "File deleted from DB.");
    } catch (e) {
      toastRef.current.addToast("error", "Something went wrong.");
      console.error("Caught error while deleting file from collection:", e);
    }
  }

  async function collectionToggleCompile(e, id) {
    try {
      await updateDoc(doc(db, "classes", currentClass.classCode), {
        [`topics.${currentTopic.topicName}.collection.${id}.noCompile`]:
          !e.target.checked,
      });
    } catch (error) {
      console.error("Caught error while pinning uploaded file:", error);
      toastRef.current.addToast("error", "Something went wrong.");
      return;
    }
  }

  async function leaveClass() {
    const classCode = currentClass?.classCode;
    if (!classCode) return;
    const ClassRef = doc(db, "classes", classCode);
    const ClassSnap = await getDoc(ClassRef);
    if (!ClassSnap.exists()) {
      console.error("Failed leaving class | Class does not exist:", classCode);
      toastRef.current.addToast("error", "Class does not exist.");
    } else {
      const classData = ClassSnap.data();
      try {
        await RemoveClassFromUser(classData.className, classCode);
        await updateDoc(ClassRef, { members: arrayRemove(userData.uid) });
        toastRef.current.addToast("success", "Successfully left class.");
      } catch (error) {
        console.error(
          "Caught error when removing class from user or when updating class' members list:",
          error
        );
      }
    }
  }

  async function compileDoc() {
    if (!currentClass || !currentTopic?.collection) return;
    const className = currentClass.className;
    const topicName = currentTopic.topicName;
    let newData = { ...compiledDocData };
    if (!(className in newData)) newData[className] = {};
    setIsCompiling(true);
    newData[className][topicName] = await generateCompiledDoc(
      currentTopic.collection,
      bulletFormat,
      grammarCheck
    );
    setCompiledDocData(newData);
    setIsCompiling(false);
  }

  return (
    <div className="page">
      <ToastContainer position="bottom" ref={toastRef} />
      {visibleOverlay == "classOverlay" && (
        <>
          <div id="classOverlay" className="overlay">
            <div className="container">
              <button
                className="joinOrCreate"
                style={{
                  fontWeight: joinOrCreate == "join" ? "bold" : "normal",
                }}
                onClick={() => setJoinOrCreate("join")}
              >
                Join
              </button>
              <button
                className="joinOrCreate"
                style={{
                  fontWeight: joinOrCreate == "create" ? "bold" : "normal",
                }}
                onClick={() => setJoinOrCreate("create")}
              >
                Create
              </button>
            </div>
            <input
              placeholder={
                joinOrCreate == "join" ? "Enter class code" : "Enter class name"
              }
              value={classOverlayValue}
              onChange={(e) => setClassOverlayValue(e.target.value)}
            />
            <button
              className="special"
              onClick={joinOrCreate == "join" ? JoinNewClass : CreateNewClass}
            >
              {joinOrCreate == "join" ? "Join" : "Create"}
            </button>
          </div>
          <div
            className="overlayBackground"
            onClick={() => setVisibleOverlay("none")}
          ></div>
        </>
      )}

      {visibleOverlay == "topicOverlay" && (
        <>
          <div id="topicOverlay" className="overlay">
            <p id="topicOverlayLabel">Create topic</p>
            <input
              placeholder="Enter topic name"
              value={topicOverlayValue}
              onChange={(e) => setTopicOverlayValue(e.target.value)}
            />
            <button className="special" onClick={CreateNewTopic}>
              Create
            </button>
          </div>
          <div
            className="overlayBackground"
            onClick={() => setVisibleOverlay("none")}
          ></div>
        </>
      )}

      <div id="panelsContainer">
        <p id="title">otify</p>

        <div id="classPanel" className="sidePanel">
          <div className="labelIconContainer">
            <p className="directoryLabel">Classes</p>
            <GoPlus
              className="goPlusIcon"
              onClick={() => setVisibleOverlay("classOverlay")}
            />
          </div>

          <div className="directoryScroll">
            {classes &&
              classes.length > 0 &&
              classes.map((cls, index) => (
                <button
                  key={index}
                  onClick={() => SelectClass(cls.className, cls.classCode)}
                  style={{
                    fontWeight: `${
                      currentClass.classCode == cls.classCode
                        ? "bold"
                        : "normal"
                    }`,
                  }}
                >
                  {cls.className}
                </button>
              ))}
          </div>
        </div>

        <div id="topicPanel" className="sidePanel">
          <div className="labelIconContainer">
            <p className="directoryLabel">Topics&nbsp;</p>
            <GoPlus
              className="goPlusIcon"
              onClick={() => setVisibleOverlay("topicOverlay")}
            />
          </div>

          <div className="directoryScroll">
            {currentClass.topics &&
              Object.keys(currentClass.topics).map((key, index) => {
                const topic = currentClass.topics[key];
                return (
                  <button
                    key={index}
                    onClick={() => setCurrentTopic(topic)}
                    style={{
                      fontWeight: `${
                        currentTopic?.topicName == topic.topicName
                          ? "bold"
                          : "normal"
                      }`,
                    }}
                  >
                    {topic.topicName}
                  </button>
                );
              })}
          </div>
        </div>
      </div>

      <div id="rightContainer">
        <div id="directoryPanel">
          <p id="classDirectory">{currentClass.className}</p>
          <p id="topicDirectory">{currentTopic?.topicName}</p>
          <p id="tabDirectory">{currentTab}</p>
          <PiSignOut id="signOut" onClick={signOutUser} />
        </div>

        <div id="tabdiv">
          <div id="tabBoxes">
            <div id="tabButtons">
              <button
                className="tabButton"
                onClick={() => setCurrentTab("Pinned Doc")}
                style={{
                  fontWeight: `${
                    currentTab == "Pinned Doc" ? "bold" : "normal"
                  }`,
                }}
              >
                Pinned Doc
              </button>
              <button
                className="tabButton"
                onClick={() => setCurrentTab("Compiled Doc")}
                style={{
                  fontWeight: `${
                    currentTab == "Compiled Doc" ? "bold" : "normal"
                  }`,
                }}
              >
                Compiled Doc
              </button>
              <button
                className="tabButton"
                onClick={() => setCurrentTab("Collection")}
                style={{
                  fontWeight: `${
                    currentTab == "Collection" ? "bold" : "normal"
                  }`,
                }}
              >
                Collection
              </button>
              <button
                className="tabButton"
                onClick={() => setCurrentTab("Members")}
                style={{
                  fontWeight: `${currentTab == "Members" ? "bold" : "normal"}`,
                }}
              >
                Members
              </button>
              <button
                className="tabButton"
                onClick={() => setCurrentTab("Class Settings")}
                style={{
                  fontWeight: `${
                    currentTab == "Class Settings" ? "bold" : "normal"
                  }`,
                }}
              >
                Class Settings
              </button>
            </div>

            {currentTab == "Pinned Doc" && (
              <div className="tabBox custom pinnedDoc">
                <p>Pinned by: {currentTopic?.pinnedDoc?.pinnedBy}</p>
                <p>Pinned date: {currentTopic?.pinnedDoc?.pinnedDate}</p>
                <label>
                  Pin new
                  <input
                    type="file"
                    accept="application/pdf"
                    style={{ display: "none" }}
                    onChange={uploadPinnedDoc}
                  />
                </label>
                <button onClick={pinCompiled}>Pin compiled</button>
              </div>
            )}

            {currentTab == "Compiled Doc" && (
              <div className="tabBox custom compiledDoc">
                <p>Compiled by: {}</p>
                <p>Compiled date: {}</p>
                <label>
                  <input
                    type="checkbox"
                    checked={grammarCheck}
                    onChange={(e) => setGrammarCheck(e.target.checked)}
                  />
                  Grammar check
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={bulletFormat}
                    onChange={(e) => setBulletFormat(e.target.checked)}
                  />
                  Bullet format
                </label>
                <button onClick={compileDoc}>Compile</button>
              </div>
            )}
          </div>

          {currentTab == "Pinned Doc" && (
            <div className="tab">
              {currentTopic?.pinnedDoc?.fileUrl &&
              isPinnedUrlValid(currentTopic.pinnedDoc.fileUrl) ? (
                <iframe
                  src={currentTopic.pinnedDoc.fileUrl.replace(
                    "/download",
                    "/view"
                  )}
                />
              ) : currentTopic?.pinnedDoc?.innerHTML ? (
                <div
                  id="compiledDocTab"
                  dangerouslySetInnerHTML={{
                    __html: currentTopic.pinnedDoc.innerHTML,
                  }}
                />
              ) : null}
            </div>
          )}

          {currentTab == "Collection" && (
            <div className="tab">
              <div id="fileDropBox">
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={uploadToCollection}
                  multiple
                />
              </div>
              <div className="listScroll">
                {currentTopic?.collection &&
                  Object.keys(currentTopic.collection).map((key, index) => {
                    const doc = currentTopic.collection[key];
                    if (isCollectionUrlValid(doc)) {
                      return (
                        <div key={key} className="listItem">
                          <p>{index + 1}</p>
                          <a
                            href={doc.fileUrl.replace("/download", "/view")}
                            target="_blank"
                          >
                            {doc.fileName || "Document link"}
                          </a>
                          <p>{doc.uploadedBy}</p>
                          <p>{doc.uploadedDate}</p>
                          <label>
                            <input
                              type="checkbox"
                              id="subscribe"
                              name="subscribe"
                              checked={!doc.noCompile}
                              onChange={(e) =>
                                collectionToggleCompile(e, doc.fileId)
                              }
                            />
                            Compile
                          </label>
                          <MdDeleteForever
                            className="deleteIcon"
                            onClick={() => deleteFileFromCollection(doc)}
                          />
                        </div>
                      );
                    }
                  })}
              </div>
            </div>
          )}

          {currentTab == "Members" && (
            <div className="tab">
              <div id="membersButtons">
                <button id="leaveButton" onClick={leaveClass}>
                  Leave class
                </button>
              </div>
              <div className="listScroll">
                {classMembers.map((userData, index) => {
                  return (
                    <div key={index} className="listItem">
                      <p>{index + 1}</p>
                      <p>{userData.username}</p>
                      <p>{userData.email}</p>
                      <MdDeleteForever className="deleteIcon" />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {currentTab === "Compiled Doc" && (
            <div className="tab" id="compiledDocTab">
              {isCompiling ? (
                <div className="flash">
                  <p>Gemini is busy generating your response...</p>
                </div>
              ) : (
                <div
                  dangerouslySetInnerHTML={{
                    __html:
                      compiledDocData[currentClass?.className]?.[
                        currentTopic?.topicName
                      ] || "No document compiled yet.",
                  }}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Home;
