// Initialize tasks array from local storage or set an empty array if not found
let tasks = JSON.parse(localStorage.getItem('tasks')) || [];

// Function to add a new task
function addTask() {
const input = document.getElementById('task-input');
const taskText = input.value.trim();
if (taskText) {
tasks.push(taskText);
localStorage.setItem('tasks', JSON.stringify(tasks));
renderTasks();
input.value = '';
}
}

// Function to render tasks in the todo list
function renderTasks() {
const todoList = document.getElementById('todo-list');
todoList.innerHTML = ''; // Clear previous tasks

tasks.forEach((task, index) => {
const li = document.createElement('li');
const checkbox = document.createElement('input');
checkbox.type = 'checkbox';
checkbox.addEventListener('change', () => toggleTask(index));
checkbox.checked = task.completed;

const textSpan = document.createElement('span');
textSpan.textContent = taskText;
if (task.completed) {
textSpan.style.textDecoration = 'line-through';
}
textSpan.contentEditable = true; // Make the text editable for editing

textSpan.addEventListener('input', () => saveTask(index)); // Save task text changes to localStorage

textSpan.addEventListener('keypress', (event) => handleKeyPress(event, index)); // Handle Enter key for adding tasks

const deleteBtn = document.createElement('button');
deleteBtn.textContent = 'Delete';
deleteBtn.addEventListener('click', () => deleteTask(index));

li.appendChild(checkbox);
li.appendChild(textSpan);
li.appendChild(deleteBtn);
todoList.appendChild(li);
});
}

// Function to toggle a task's completion status
function toggleTask(index) {
tasks[index].completed = !tasks[index].completed;
localStorage.setItem('tasks', JSON.stringify(tasks));
renderTasks();
}

// Function to delete a task
function deleteTask(index) {
tasks.splice(index, 1);
localStorage.setItem('tasks', JSON.stringify(tasks));
renderTasks();
}

// Function to save task text changes to localStorage
function saveTask(index) {
tasks[index].text = textSpan.textContent;
localStorage.setItem('tasks', JSON.stringify(tasks));
}

// Function to handle Enter key for adding tasks
function handleKeyPress(event, index) {
if (event.key === 'Enter') {
event.preventDefault();
addTask();
}
}

// Render tasks on page load
renderTasks();