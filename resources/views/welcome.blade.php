<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Laravel Popup Button</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background-color: #f4f4f4;
        }

        /* Button styling */
        .popup-btn {
            padding: 12px 28px;
            font-size: 16px;
            background-color: #3490dc;
            color: #fff;
            border: none;
            border-radius: 6px;
            cursor: pointer;
        }

        .popup-btn:hover {
            background-color: #2779bd;
        }

        /* Overlay background */
        .overlay {
            display: none;
            position: fixed;
            inset: 0;
            background-color: rgba(0, 0, 0, 0.5);
            z-index: 100;
            justify-content: center;
            align-items: center;
        }

        .overlay.active {
            display: flex;
        }

        /* Popup box */
        .popup {
            background-color: #fff;
            padding: 32px 40px;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
            text-align: center;
            max-width: 400px;
            width: 90%;
        }

        .popup h2 {
            margin-top: 0;
            color: #3490dc;
        }

        .popup p {
            color: #555;
            line-height: 1.6;
        }

        .close-btn {
            margin-top: 16px;
            padding: 10px 24px;
            font-size: 14px;
            background-color: #e3342f;
            color: #fff;
            border: none;
            border-radius: 5px;
            cursor: pointer;
        }

        .close-btn:hover {
            background-color: #cc1f1a;
        }
    </style>
</head>
<body>

    {{-- Trigger button --}}
    <button class="popup-btn" onclick="openPopup()">Click Me</button>

    {{-- Popup overlay --}}
    <div class="overlay" id="popupOverlay" onclick="closeOnOutsideClick(event)">
        <div class="popup" id="popupBox">
            <h2>Hello from Laravel!</h2>
            <p>This is a pop-up message triggered by a button click.</p>
            <button class="close-btn" onclick="closePopup()">Close</button>
        </div>
    </div>

    <script>
        function openPopup() {
            document.getElementById('popupOverlay').classList.add('active');
        }

        function closePopup() {
            document.getElementById('popupOverlay').classList.remove('active');
        }

        // Close popup when clicking outside the popup box
        function closeOnOutsideClick(event) {
            if (event.target === document.getElementById('popupOverlay')) {
                closePopup();
            }
        }
    </script>

</body>
</html>
