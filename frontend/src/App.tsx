import { Navigate, Route, Routes } from "react-router-dom";

import { ResultsPage } from "./pages/ResultsPage";
import { UploadPage } from "./pages/UploadPage";

function App() {
	return (
		<Routes>
			<Route path="/" element={<UploadPage />} />
			<Route path="/results/:jobId" element={<ResultsPage />} />
			<Route path="*" element={<Navigate to="/" replace />} />
		</Routes>
	);
}

export default App;
