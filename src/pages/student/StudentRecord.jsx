// src/pages/student/StudentRecord.jsx
import StudentRecordPanel from "../../components/student/StudentRecordPanel";
import { currentStudentRecord } from "../../data/masterlistSample";

export default function StudentRecord() {
  return (
    <div className="pt-2 md:pt-4 max-w-4xl mx-auto">
      <StudentRecordPanel student={currentStudentRecord} />
    </div>
  );
}
