import socket
import os
import threading
from tkinter import *
from tkinter import filedialog, messagebox, ttk
from pathlib import Path

class PS5FileSender:
    def __init__(self, root):
        self.root = root
        self.root.title("PS5 File Sender - mansoor0x")
        self.root.geometry("600x550")
        self.root.configure(bg="#1a1a2e")
        
        self.root.resizable(False, False)
        
        self.selected_files = []
        self.server_ip = StringVar(value="192.168.1.100")
        self.port = IntVar(value=1337)
        
        self.setup_ui()
        
    def setup_ui(self):
        title_frame = Frame(self.root, bg="#1a1a2e")
        title_frame.pack(pady=20, fill=X)
        
        title_label = Label(title_frame, text="PS5 FILE SENDER", 
                           font=("Arial", 20, "bold"), 
                           fg="#00d4ff", bg="#1a1a2e")
        title_label.pack()
        
        subtitle_label = Label(title_frame, text="@mansoor0x | GitHub and  X", 
                              font=("Arial", 10), 
                              fg="#888888", bg="#1a1a2e")
        subtitle_label.pack()
        
        settings_frame = Frame(self.root, bg="#16213e", relief=RAISED, bd=2)
        settings_frame.pack(pady=10, padx=20, fill=X)
        
        Label(settings_frame, text="PS5 IP Address:", 
              fg="white", bg="#16213e", font=("Arial", 10)).grid(row=0, column=0, padx=10, pady=10, sticky=W)
        
        ip_entry = Entry(settings_frame, textvariable=self.server_ip, 
                        width=20, bg="#0f3460", fg="white", 
                        insertbackground="white", font=("Arial", 10))
        ip_entry.grid(row=0, column=1, padx=10, pady=10)
        
        Label(settings_frame, text="Port:", 
              fg="white", bg="#16213e", font=("Arial", 10)).grid(row=0, column=2, padx=10, pady=10, sticky=W)
        
        port_entry = Entry(settings_frame, textvariable=self.port, 
                          width=8, bg="#0f3460", fg="white", 
                          insertbackground="white", font=("Arial", 10))
        port_entry.grid(row=0, column=3, padx=10, pady=10)
        
        files_frame = Frame(self.root, bg="#16213e", relief=RAISED, bd=2)
        files_frame.pack(pady=10, padx=20, fill=BOTH, expand=True)
        
        Label(files_frame, text="Selected Files:", 
              fg="white", bg="#16213e", font=("Arial", 12, "bold")).pack(pady=5)
        
        list_frame = Frame(files_frame, bg="#16213e")
        list_frame.pack(pady=5, padx=10, fill=BOTH, expand=True)
        
        scrollbar = Scrollbar(list_frame)
        scrollbar.pack(side=RIGHT, fill=Y)
        
        self.files_listbox = Listbox(list_frame, bg="#0f3460", fg="white", 
                                     selectbackground="#00d4ff", 
                                     font=("Arial", 9), yscrollcommand=scrollbar.set)
        self.files_listbox.pack(fill=BOTH, expand=True)
        scrollbar.config(command=self.files_listbox.yview)
        
        buttons_frame = Frame(files_frame, bg="#16213e")
        buttons_frame.pack(pady=10)
        
        Button(buttons_frame, text="📁 Add Files", command=self.add_files,
               bg="#00d4ff", fg="black", font=("Arial", 10, "bold"),
               padx=20, pady=5, cursor="hand2").pack(side=LEFT, padx=5)
        
        Button(buttons_frame, text="🗑 Remove Selected", command=self.remove_file,
               bg="#ff4757", fg="white", font=("Arial", 10, "bold"),
               padx=20, pady=5, cursor="hand2").pack(side=LEFT, padx=5)
        
        Button(buttons_frame, text="📋 Clear All", command=self.clear_files,
               bg="#ffa502", fg="white", font=("Arial", 10, "bold"),
               padx=20, pady=5, cursor="hand2").pack(side=LEFT, padx=5)
        
        send_button = Button(self.root, text="🚀 SEND FILES TO PS5", 
                            command=self.send_files_thread,
                            bg="#00d4ff", fg="black", font=("Arial", 14, "bold"),
                            padx=40, pady=10, cursor="hand2")
        send_button.pack(pady=15)
        
        progress_frame = Frame(self.root, bg="#1a1a2e")
        progress_frame.pack(pady=5, padx=20, fill=X)
        
        self.progress_bar = ttk.Progressbar(progress_frame, length=400, mode='determinate')
        self.progress_bar.pack()
        
        self.status_label = Label(progress_frame, text="Ready", 
                                  fg="#00d4ff", bg="#1a1a2e", font=("Arial", 9))
        self.status_label.pack(pady=5)
        
        info_label = Label(self.root, text="⚠️ Make sure PS5 is running the payload server\nSupported files: .bin, .elf, .so, .js",
                          fg="#ffa502", bg="#1a1a2e", font=("Arial", 9))
        info_label.pack(pady=10)
        
    def add_files(self):
        files = filedialog.askopenfilenames(
            title="Select PS5 files",
            filetypes=[("All supported", "*.bin *.elf *.so *.js"), 
                      ("Binary files", "*.bin"),
                      ("ELF files", "*.elf"),
                      ("Shared objects", "*.so"),
                      ("JavaScript", "*.js")]
        )
        
        for file in files:
            if file not in self.selected_files:
                self.selected_files.append(file)
                self.files_listbox.insert(END, os.path.basename(file))
                
        self.status_label.config(text=f"Loaded {len(self.selected_files)} files")
        
    def remove_file(self):
        selection = self.files_listbox.curselection()
        if selection:
            index = selection[0]
            self.files_listbox.delete(index)
            del self.selected_files[index]
            self.status_label.config(text=f"Loaded {len(self.selected_files)} files")
            
    def clear_files(self):
        self.selected_files.clear()
        self.files_listbox.delete(0, END)
        self.status_label.config(text="Cleared all files")
        
    def send_file(self, file_path):
        try:
            client = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            client.settimeout(10)
            client.connect((self.server_ip.get(), self.port.get()))
            
            with open(file_path, 'rb') as f:
                file_data = f.read()
            
            file_name = os.path.basename(file_path)
            file_size = len(file_data)
            
            header = f"{file_name}\n{file_size}\n".encode()
            client.send(header)
            
            client.send(file_data)
            
            response = client.recv(1024).decode()
            client.close()
            
            return response == "OK"
            
        except Exception as e:
            print(f"Error: {e}")
            return False
            
    def send_files(self):
        if not self.selected_files:
            messagebox.showwarning("Warning", "No files selected!")
            return
            
        if not self.server_ip.get():
            messagebox.showerror("Error", "Please enter PS5 IP address!")
            return
            
        self.status_label.config(text="Sending files...")
        self.progress_bar['maximum'] = len(self.selected_files)
        self.progress_bar['value'] = 0
        
        success_count = 0
        
        for i, file_path in enumerate(self.selected_files):
            file_name = os.path.basename(file_path)
            self.status_label.config(text=f"Sending: {file_name}")
            self.root.update()
            
            if self.send_file(file_path):
                success_count += 1
                self.status_label.config(text=f"✓ Sent: {file_name}")
            else:
                self.status_label.config(text=f"✗ Failed: {file_name}")
                
            self.progress_bar['value'] = i + 1
            self.root.update()
            
        result_text = f"Complete! {success_count}/{len(self.selected_files)} files sent successfully"
        self.status_label.config(text=result_text)
        
        if success_count == len(self.selected_files):
            messagebox.showinfo("Success", result_text)
        else:
            messagebox.showwarning("Partial Success", result_text)
            
    def send_files_thread(self):
        thread = threading.Thread(target=self.send_files)
        thread.daemon = True
        thread.start()

if __name__ == "__main__":
    root = Tk()
    app = PS5FileSender(root)
    root.mainloop()